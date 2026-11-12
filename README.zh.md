# dsh-ptt

**DeepSeek Harness 的按住说话插件。** 按住 <kbd>Alt</kbd> 录音，松开自动转写——复用官方语音输入插件，只补上缺失的键盘交互。

[English](README.md)

---

## 它做什么

DeepSeek Harness 自带的语音输入插件（`@deepseek-ai/dsh-experimental-client-ui-voice-input`）只能点麦克风按钮用。这个插件补上了缺失的键盘操作：

| 操作 | 结果 |
| --- | --- |
| **按住 <kbd>Alt</kbd>** | 立刻开始录音，不用碰鼠标 |
| **松开 <kbd>Alt</kbd>** | 停止录音，文字转写进输入框 |
| 按早了就松开 | 等录音真正开始后立刻停止，不会留下悬空会话 |
| 转写为空或失败 | 自动关掉“未识别到语音”提示条，可直接再按 |
| 录音被中断（Esc、窗口失焦、超时） | 状态干净复位 |

它**不重写**录音、转写和文字插入——那些仍由官方插件负责。本插件只负责驱动它的按钮，因此音视频处理、模型选择、语言设置和权限行为全部保持原样。

## 前置条件

- DeepSeek Harness `0.2.x`（桌面版或 `dsh web`）
- 官方语音输入 bundle 已启用：`@deepseek-ai/dsh-experimental-voice-input-bundle`
- 本地识别需先下载一次 SenseVoice 模型（首次手动点麦克风走完安装流程）

## 安装

### 从本地克隆安装

```bash
git clone https://github.com/YOUR_GITHUB_NAME/dsh-ptt.git
```

把它作为 `file:` 依赖加入你的 profile，并在 patch 层挂载。

编辑 `~/.dsh/profiles/desktop/package.json`：

```json
{
  "dependencies": {
    "@yg/dsh-ptt": "file:./dsh-ptt"
  }
}
```

在 profile 目录里执行 `pnpm install`，然后往 `~/.dsh/profiles/desktop/cordis.patch.yml` 追加：

```yaml
# Push-to-talk: hold Alt to record, release to transcribe (@yg/dsh-ptt).
- insert:
    - id: ptt-voice
      name: '@yg/dsh-ptt'
```

重启 DeepSeek Harness，并刷新窗口。

## 确认已加载

在插件页里找到 `ptt-voice` / `@yg/dsh-ptt`，状态应为 **已启用 / active**。

## 配置

标签匹配基于语音输入插件的 `aria-label`，正常使用无需任何配置。已覆盖全部内置界面语言：

`zh` · `en` · `ja` · `es` · `fr` · `de` · `ru` · `pt`

如果未来某版 DeepSeek Harness 改了按钮文案，只需更新 [`lib/client.js`](lib/client.js) 顶部的标签表——录音、转写、插入逻辑都不受影响。

## 工作原理

客户端一半是一个小型状态机，监视官方插件在 DOM 中的按钮：

```
idle ──按下 Alt──▶ waiting ──录音栏出现──▶ recording ──松开 Alt──▶ stopping ──栏位关闭──▶ idle
                      │                                                  │
                      └─ 提前松开 ─▶ 一开始录音就立即停止                  └─ 消息栏 ─▶ 点 × ─▶ idle
```

- 按钮靠 `aria-label` 定位，不依赖 CSS 类名或 DOM 位置，样式改版不会导致失效。
- 自动点击只针对「取消」提示条的 ×；「丢弃识别文字」的 × 永不触碰——那个保护的是你可能还想保留的转写文字。

## 升级安全性

插件完全位于 DSH 的 **profile** 目录内。升级 DeepSeek Harness 只会替换 `app.asar`，不会动 profile，因此本插件跨版本升级依然可用——不同于直接修改安装目录里的文件。

## 注意事项

- <kbd>Alt</kbd> 是系统键：<kbd>Alt</kbd>+<kbd>Tab</kbd>、<kbd>Shift</kbd>+<kbd>Alt</kbd> 等组合会被忽略。
- 窗口失焦会取消录音，所以录音过程中不要切换窗口。
- 浏览器麦克风需要 HTTPS 或环回地址（`127.0.0.1` 即可）。

## 许可

[MIT](LICENSE)
