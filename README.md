# tmux-watch

[中文](#zh) | [English](#en)

<a id="zh"></a>
## 中文

基于 tmux 输出的稳定性监测插件：当某个 pane 的输出在 N 秒内保持不变时，触发告警并唤醒 Agent，总结并通知你。

### 安装

#### 从 npm 安装

```bash
openclaw plugins install tmux-watch
```

#### 从本地目录安装

```bash
openclaw plugins install /path/to/tmux-watch
```

或使用软链接（便于开发调试）：

```bash
openclaw plugins install --link /path/to/tmux-watch
```

#### 从归档安装

```bash
openclaw plugins install ./tmux-watch.tgz
```

> 安装或启用插件后需要重启 Gateway。

### 配置

在 `~/.openclaw/openclaw.json` 中启用并配置：

```json5
{
  "plugins": {
    "entries": {
      "tmux-watch": {
        "enabled": true,
        "config": {
          "socket": "/private/tmp/tmux-501/default",
          "pollIntervalMs": 1000,
          "stableSeconds": 5,
          "captureLines": 200,
          "stripAnsi": true,
          "maxOutputChars": 4000,
          "notify": {
            "mode": "targets",
            "targets": [
              { "channel": "gewe-openclaw", "target": "wxid_xxx", "label": "gewe" }
            ]
          }
        }
      }
    }
  }
}
```

### 快速配置（onboarding）

插件提供一个最小化向导，仅要求设置 `socket`：

```bash
openclaw tmux-watch setup
```

你也可以手动指定：

```bash
openclaw tmux-watch setup --socket "/private/tmp/tmux-501/default"
```

#### socket 如何获取

进入目标 tmux 会话后执行：

```bash
echo $TMUX
```

输出形如：

```
/private/tmp/tmux-501/default,3191,4
```

逗号前的路径就是 socket，配置到 `socket` 字段即可。

### 订阅（通过 Agent 工具）

```json
{
  "action": "add",
  "target": "session:0.0",
  "label": "codex-tui",
  "note": "本会话是AI编程TUI助手，卡住时总结最后输出并通知我",
  "stableSeconds": 5
}
```

### 依赖

- 系统依赖：`tmux`
- peer 依赖：`openclaw >= 2026.1.29`

<a id="en"></a>
## English

tmux-watch monitors a tmux pane and triggers an alert when the output stays unchanged for N seconds.
The agent is woken up to summarize the last output and notify you.

### Install

#### From npm

```bash
openclaw plugins install tmux-watch
```

#### From a local directory

```bash
openclaw plugins install /path/to/tmux-watch
```

Or use a symlink (for local development):

```bash
openclaw plugins install --link /path/to/tmux-watch
```

#### From an archive

```bash
openclaw plugins install ./tmux-watch.tgz
```

> Restart the Gateway after installing or enabling the plugin.

### Configuration

Edit `~/.openclaw/openclaw.json`:

```json5
{
  "plugins": {
    "entries": {
      "tmux-watch": {
        "enabled": true,
        "config": {
          "socket": "/private/tmp/tmux-501/default",
          "pollIntervalMs": 1000,
          "stableSeconds": 5,
          "captureLines": 200,
          "stripAnsi": true,
          "maxOutputChars": 4000,
          "notify": {
            "mode": "targets",
            "targets": [
              { "channel": "gewe-openclaw", "target": "wxid_xxx", "label": "gewe" }
            ]
          }
        }
      }
    }
  }
}
```

#### Find the socket

Inside the target tmux session:

```bash
echo $TMUX
```

Output looks like:

```
/private/tmp/tmux-501/default,3191,4
```

Use the path before the first comma as `socket`.

### Quick setup (onboarding)

The plugin ships a minimal setup wizard that only requires the `socket`:

```bash
openclaw tmux-watch setup
```

Or pass it explicitly:

```bash
openclaw tmux-watch setup --socket "/private/tmp/tmux-501/default"
```

### Add a subscription (via agent tool)

```json
{
  "action": "add",
  "target": "session:0.0",
  "label": "codex-tui",
  "note": "This is an AI coding TUI; summarize the last output and notify me if it stalls.",
  "stableSeconds": 5
}
```

### Requirements

- System dependency: `tmux`
- Peer dependency: `openclaw >= 2026.1.29`
