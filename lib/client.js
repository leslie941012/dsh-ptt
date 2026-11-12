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
		// × on the message bar: "取消" family. NOT "丢弃识别文字" (that × guards a kept
		// transcript the user may still want — never click it).
		const CANCEL = new Set([
			"取消", "Cancel", "キャンセル", "Annuler", "Abbrechen", "Отмена"
		]);
		const find = (labels) => {
			for (const el of document.querySelectorAll('button[aria-label], [role="button"][aria-label]')) {
				if (labels.has(el.getAttribute("aria-label"))) return el;
			}
		};
		// idle | waiting (start clicked, permission/lead-in in flight) | recording
		// | stopping (stop clicked, transcription in flight) | recovering (dismissed a stuck bar)
		let state = "idle";
		let poll = 0;
		let tries = 0;
		let stopPending = false;
		const reset = () => {
			state = "idle";
			stopPending = false;
			tries = 0;
			if (poll) { clearInterval(poll); poll = 0; }
		};
		window.addEventListener("blur", reset);
		const tick = () => {
			const stop = find(STOP);
			const cancel = find(CANCEL);
			switch (state) {
				case "waiting": // start click accepted: recording bar appears (or a cancel × during permission)
					if (stop) {
						state = "recording";
						if (stopPending) { stop.click(); state = "stopping"; }
					} else if (cancel) {
						// permission denied / device missing → bar shows a message with ×; dismiss it
						if (++tries > 20) { cancel.click(); reset(); }
					} else if (++tries > 20) { reset(); }
					break;
				case "stopping": // stop clicked: wait out transcription, then clean up
					if (stop) break; // stop click not rendered yet (× still from recording row)
					if (cancel) { cancel.click(); reset(); break; } // "no speech"/error bar → dismiss it
					if (!find(START)) break; // bar still open, transcription in flight → keep waiting
					reset(); // bar closed: transcript inserted (or kept as pending text)
					break;
				case "recording":
					if (!stop) reset(); // ended by itself (Esc, blur, max duration)
					break;
				case "recovering": // dismissed a stuck bar; start recording as soon as the mic is back
					{
						const start = find(START);
						if (start) { start.click(); state = "waiting"; tries = 0; }
						else if (stop || ++tries > 20) reset();
					}
					break;
			}
		};
		const beginPoll = () => {
			if (poll) clearInterval(poll);
			tries = 0;
			poll = setInterval(tick, 150);
		};
		window.addEventListener("keydown", (event) => {
			if (event.key !== "Alt" || event.repeat || event.ctrlKey || event.shiftKey || event.metaKey) return;
			if (event.defaultPrevented) return;
			if (state !== "idle") { event.preventDefault(); return; }
			const start = find(START);
			if (start) {
				event.preventDefault();
				start.click();
				state = "waiting";
				beginPoll();
				return;
			}
			// Bar stuck on a message (e.g. "no speech" left over from a manual click session):
			// dismiss it, then start recording once the mic button returns.
			if (!find(STOP)) {
				const cancelBar = find(CANCEL);
				if (cancelBar) {
					event.preventDefault();
					cancelBar.click();
					state = "recovering";
					beginPoll();
				}
			}
		});
		window.addEventListener("keyup", (event) => {
			if (event.key !== "Alt" || event.ctrlKey || event.shiftKey || event.metaKey) return;
			event.preventDefault();
			if (state === "recording") {
				const stop = find(STOP);
				if (stop) stop.click();
				state = "stopping";
				beginPoll();
			} else if (state === "waiting") {
				stopPending = true; // released early: stop as soon as recording actually begins
			}
		});
		};
		return { apply };
	}
});
