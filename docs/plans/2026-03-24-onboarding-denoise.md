# Onboarding And Alert Denoise Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现一键 onboarding，并为稳定告警增加基础版去噪能力。

**Architecture:** 在 CLI `setup` 流程里增加 pane 发现与 subscription 创建，把“配置插件”和“开始监控”合并成一次操作。manager 保持原有稳定检测模型，只新增输出规范化和通知 gate，用于 cooldown、最小输出长度和空白变化去噪。

**Tech Stack:** TypeScript, Commander, Node test runner (`tsx --test`)

---

### Task 1: 先补失败测试

**Files:**
- Create: `tests/cli.setup.test.ts`
- Create: `tests/manager.denoise.test.ts`

**Step 1: Write the failing test**

- 为 setup helper 写测试，覆盖 pane 列表解析与“写配置 + 创建订阅”的一键流程。
- 为 manager 去噪写测试，覆盖 cooldown、`minOutputChars`、`ignoreWhitespaceOnlyChanges`。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli.setup.test.ts tests/manager.denoise.test.ts`

Expected: FAIL，因为 onboarding helper 和去噪逻辑尚未实现。

### Task 2: 实现一键 onboarding

**Files:**
- Modify: `src/cli.ts`
- Modify: `README.md`

**Step 1: Write minimal implementation**

- 增加 pane discovery / parsing helper。
- 扩展 `setup` 支持 `--target`、`--label`、`--note`。
- 交互模式下选择 pane，写配置后调用 manager 创建 subscription。

**Step 2: Run targeted tests**

Run: `npm test -- tests/cli.setup.test.ts`

Expected: PASS

### Task 3: 实现告警去噪

**Files:**
- Modify: `src/config.ts`
- Modify: `src/manager.ts`
- Modify: `src/tmux-watch-tool.ts`
- Modify: `README.md`

**Step 1: Write minimal implementation**

- 新增去噪配置字段及解析。
- 在 manager 中增加输出规范化、最小输出长度和 cooldown 判断。
- 保持现有稳定检测主语义不变。

**Step 2: Run targeted tests**

Run: `npm test -- tests/manager.denoise.test.ts tests/logic.test.ts`

Expected: PASS

### Task 4: 完整验证

**Files:**
- No additional files

**Step 1: Run full verification**

Run: `npm run check`

Expected: PASS
