# tmux-watch Onboarding + Alert Denoise Design

**Goal:** 把 `tmux-watch setup` 升级为真正的一键 onboarding，并为稳定告警增加基础去噪能力。

**User Experience**

- `openclaw tmux-watch setup` 在交互模式下完成：
  1. 自动或手动获取 tmux socket。
  2. 读取可用 pane 列表并让用户选择一个目标 pane。
  3. 可选填写 label / note。
  4. 写入插件配置并立即创建一条 subscription。
- 非 TTY 场景支持参数式快速完成：
  - `--socket`
  - `--target`
  - 可选 `--label` / `--note`

**Denoise Scope**

- `cooldownSeconds`：同一 subscription 告警后，在冷却窗口内不重复提醒。
- `minOutputChars`：输出长度过短时不提醒。
- `ignoreWhitespaceOnlyChanges`：只发生空白变化时视为同一输出。

**Architecture**

- CLI 层新增 pane discovery / selection helper，并在 `setup` 中串起“写配置 + 创建订阅”闭环。
- 配置与订阅模型新增去噪字段，允许插件级默认值和订阅级覆盖。
- `manager.pollWatch()` 在稳定判断前使用规范化输出参与 hash，在告警前增加去噪 gate。

**Behavior Rules**

- 核心规则保持不变：仍然只有“连续稳定 N 次”才触发告警。
- 冷却期只抑制通知，不影响持续采样。
- 当输出内容发生实际变化时，冷却状态按现有“新 hash 重新开始稳定计数”的路径自然结束。
- `minOutputChars` 基于去 ANSI、去尾随换行后的最终输出长度判断。

**Testing**

- CLI 测试：
  - setup 非交互模式会写入 socket 并创建 subscription。
  - pane 列表输出可被正确解析。
- Manager 测试：
  - cooldown 阻止相同稳定输出的重复提醒。
  - 输出过短时不通知。
  - 仅空白变化不视为新输出。

**Non-goals**

- 这轮不做多 pane 批量订阅。
- 这轮不做 ignore regex / 关键词静默。
- 这轮不做远程 tmux。
