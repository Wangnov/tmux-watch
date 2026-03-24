# tmux-watch Config Compat Design

**Goal:** 把旧版 timing 字段兼容从业务层移到独立 adapter，内部统一使用新版 `captureIntervalSeconds` / `stableCount`。

**Scope**

- 保留对旧字段 `pollIntervalMs`、`stableSeconds`、`intervalMs` 的输入兼容。
- `manager` 主流程不再直接解析旧字段。
- 补一条覆盖新旧输入的 smoke test。
- README 明确新版字段为推荐写法，旧字段仅用于兼容。

**Approach**

1. 新增 compat adapter，负责把插件配置和订阅输入统一规范化。
2. 插件配置解析后输出内部标准配置，只保留新版 timing 字段。
3. 订阅新增/更新时立即规范化并持久化为新版字段，避免旧字段继续扩散到状态文件。
4. agent 工具层继续接受旧参数，但写入 manager 前就完成兼容映射。

**Testing**

- 单元测试覆盖：
  - 新字段优先于旧字段。
  - 仅有旧字段时可正确换算出新版字段。
  - `manager.addSubscription` 接受旧订阅参数后，内部/持久化结果只保留新版字段。
- smoke test 覆盖：
  - “新版配置 + 新版订阅输入”和“旧版配置 + 旧版订阅输入”都能走通一次最小订阅链路。

**Non-goals**

- 本轮不做 OpenClaw 多版本 API 兼容。
- 本轮不改动 tmux 捕获、通知投递等业务行为。
