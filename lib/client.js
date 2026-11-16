window.__ModuleLoader__.load({
	id: "@yg/dsh-ptt",
	factory: () => {
		const apply = () => {
			if (window.__ygPttInstalled) return;
			window.__ygPttInstalled = true;

			// aria-labels of the official voice-input plugin's buttons, all shipped locales.
			const START = new Set([
				"开始录音", "Start recording", "録音を開始", "Empezar a grabar",
				"Commencer l'enregistrement", "Starten Sie die Aufnahme", "Начать запись", "Comece a gravar"
			]);
			const STOP = new Set([
				"停止并识别", "Stop and transcribe", "停止して文字起こし", "Detener y transcribir",
				"Arrêtez et transcrivez", "Stoppen Sie und transkribieren Sie", "Остановись и перепиши", "Pare e transcreva"
			]);
			// × on the message bar: the "Cancel" family. NOT "丢弃识别文字" — that × guards a
			// transcript the user may still want, so it is never clicked.
			const CANCEL = new Set(["取消", "Cancel", "キャンセル", "Annuler", "Abbrechen", "Отмена"]);
			// Presence of the retry button marks an error / no-speech bar (feedback phase):
			// transcription is no longer in flight, so dismissing the bar is safe.
			const RETRY = new Set([
				"重新录音", "Record again", "もう一度録音", "Grabar de nuevo",
				"Enregistrer à nouveau", "Nochmals aufnehmen", "Записать еще раз", "Grave novamente"
			]);

			const find = (labels) => {
				for (const el of document.querySelectorAll('button[aria-label], [role="button"][aria-label]')) {
					if (labels.has(el.getAttribute("aria-label"))) return el;
				}
			};
			// The official bar carries data-voice-activity="{phase}"; this is the authoritative
			// way to tell a transcription in flight from a finished error bar.
			const readPhase = () => {
				const el = document.querySelector("[data-voice-activity]");
				return el ? el.getAttribute("data-voice-activity") : null;
			};

			// The click on the mic is deferred by this much so that a chord (Alt+Q, Alt+Tab)
			// cancels it before recording ever starts.
			const CHORD_GUARD_MS = 260;
			// How long a stranded recording may keep running once Alt is known to be up.
			const ORPHAN_GRACE_MS = 900;
			// How long the permission prompt ("requesting") may stay open before it is dismissed.
			const REQUEST_TIMEOUT_MS = 8000;
			// Safety net for a hung transcription: never touched before this.
			const STOP_TIMEOUT_MS = 45000;
			const TICK_MS = 150;

			// idle       nothing armed
			// arming     Alt is down, the chord guard has not elapsed yet
			// waiting    mic clicked, recording bar not rendered yet
			// recording  bar rendered, stop click pending
			// stopping   stop clicked: transcribing in flight, or an error bar waiting to be dismissed
			// recovering dismissed a stuck bar, waiting for the mic to return
			let state = "idle";
			let poll = 0;
			let armTimer = 0;
			let stopPending = false;
			let orphanTicks = 0;

			// Physical Alt state. Kept from keydown/keyup, but corrected by evidence when a
			// keyup is lost to a window switch (Alt+Q hands focus to another app).
			let altDown = false;
			let altDownAt = 0;

			const clearArm = () => {
				if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
			};
			const clearPoll = () => {
				if (poll) { clearInterval(poll); poll = 0; }
			};
			const reset = () => {
				clearArm();
				clearPoll();
				state = "idle";
				stopPending = false;
				orphanTicks = 0;
			};
			const beginPoll = () => {
				clearPoll();
				orphanTicks = 0;
				poll = setInterval(tick, TICK_MS);
			};

			// Click stop on the live recording bar. If the bar is mid-transition and the stop
			// button is not in the DOM yet, keep watching instead of giving up: the waiting
			// state clicks it as soon as it renders (stopPending stays set).
			const stopNow = () => {
				stopPending = true;
				const stop = find(STOP);
				if (!stop) {
					if (readPhase() === "transcribing") { state = "stopping"; beginPoll(); return; }
					state = "waiting";
					beginPoll();
					return;
				}
				stop.click();
				state = "stopping";
				beginPoll();
			};

			// Dismiss an error bar (retry button present) or any bar after the safety timeout.
			const dismissBar = () => {
				const c = find(CANCEL);
				if (c) c.click();
				reset();
			};

			function tick() {
				const stop = find(STOP);
				const cancel = find(CANCEL);
				const phase = readPhase();

				// Orphan guard: Alt is provably up yet a recording is still live.
				if (!altDown && (state === "recording" || state === "waiting")) {
					if (++orphanTicks * TICK_MS > ORPHAN_GRACE_MS) {
						if (!stop && phase !== "recording") { reset(); return; }
						stopNow();
						return;
					}
				} else if (altDown) {
					orphanTicks = 0;
				}

				switch (state) {
					case "waiting":
						if (stop || phase === "recording") {
							state = "recording";
							if (stopPending) stopNow();
						} else if (phase === "transcribing") {
							// auto-finished while we were waiting: hand over to the stopping path
							state = "stopping";
						} else if (cancel || phase === "feedback") {
							// permission prompt / device missing: give it REQUEST_TIMEOUT_MS, then dismiss
							if (++orphanTicks * TICK_MS > REQUEST_TIMEOUT_MS) dismissBar();
						} else if (!phase && ++orphanTicks * TICK_MS > 3000) {
							reset(); // bar vanished without a phase marker
						}
						break;
					case "recording":
						if (!stop && phase !== "recording") {
							// bar left the recording phase on its own (max duration, Esc, blur)
							if (phase === "transcribing" || phase === "feedback") { state = "stopping"; break; }
							reset();
						}
						break;
					case "stopping":
						if (stop) break; // stop click not rendered yet
						if (phase === "transcribing" || phase === "requesting") break; // in flight: hands off
						if (find(RETRY) || phase === "feedback") { dismissBar(); break; } // error / no-speech bar
						if (cancel && !phase) { dismissBar(); break; } // legacy DOM without the phase marker
						if (!find(START) && !phase) {
							// unknown bar state without the phase marker: bounded wait, then recover
							if (++orphanTicks * TICK_MS > STOP_TIMEOUT_MS) dismissBar();
							break;
						}
						if (!find(START)) break; // pending-conflict bar: the user decides
						reset(); // bar closed: transcript inserted
						break;
					case "recovering": // dismissed a stuck bar; start recording as soon as the mic is back
						if (find(START)) {
							if (!altDown) { reset(); break; } // user let go while we waited
							find(START).click();
							state = "waiting";
							orphanTicks = 0;
						} else if (stop || ++orphanTicks * TICK_MS > 3000) {
							reset();
						}
						break;
				}
			}

			const beginRecording = () => {
				const start = find(START);
				if (start) {
					start.click();
					state = "waiting";
					beginPoll();
					return;
				}
				// A message bar may be left over from a manual click: dismiss it and retry.
				if (!find(STOP)) {
					const cancelBar = find(CANCEL);
					if (cancelBar) {
						cancelBar.click();
						state = "recovering";
						beginPoll();
					}
				}
			};

			window.addEventListener("keydown", (event) => {
				if (event.key !== "Alt") return;
				altDown = true;
				if (event.repeat) return;
				altDownAt = Date.now();
				if (state !== "idle") return; // already busy: leave the bar alone
				clearArm();
				state = "arming";
				armTimer = setTimeout(() => {
					armTimer = 0;
					// Released inside the guard window: a tap, not push-to-talk.
					if (!altDown || state !== "arming") { if (state === "arming") state = "idle"; return; }
					beginRecording();
				}, CHORD_GUARD_MS);
			}, true);

			// Another key while Alt is held means a chord: cancel the pending recording.
			window.addEventListener("keydown", (event) => {
				if (event.key === "Alt") return;
				if (armTimer) { clearArm(); state = "idle"; }
			}, true);

			window.addEventListener("keyup", (event) => {
				if (event.key !== "Alt") return;
				altDown = false;
				clearArm();
				if (state === "arming") { state = "idle"; return; }
				if (state === "recording" || state === "waiting") stopNow();
			}, true);

			// Focus left the page: an Alt+Q style chord may have delivered the keyup elsewhere.
			// Re-derive the modifier state from the next trusted event instead of trusting our flag.
			window.addEventListener("blur", () => {
				clearArm();
				if (state === "arming") state = "idle";
			});
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) {
					clearArm();
					if (state === "arming") state = "idle";
				}
			});

			// The authoritative check: any event carrying modifier state tells us whether Alt is
			// really down. A pointer move or key event without altKey proves the key is up.
			const syncAlt = (event) => {
				if (typeof event.altKey !== "boolean") return;
				if (!event.altKey && Date.now() - altDownAt > CHORD_GUARD_MS) altDown = false;
			};
			window.addEventListener("mousemove", syncAlt, true);
			window.addEventListener("pointerdown", syncAlt, true);
			window.addEventListener("focus", syncAlt, true);

			// Belt and braces: a held Alt that never produces any activity is stale.
			setInterval(() => {
				if (altDown && state === "idle" && !armTimer && Date.now() - altDownAt > 5000) altDown = false;
			}, 2000);
		};
		return { apply };
	}
});
