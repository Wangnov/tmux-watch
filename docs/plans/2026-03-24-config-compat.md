# Config Compat Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 引入 compat adapter，移除业务层散落的旧 timing shim，同时保留旧输入兼容和新增 smoke test。

**Architecture:** 通过独立 compat 模块统一把旧 timing 字段规范化为新版字段。`config` 和 `manager` 在入口完成适配，后续逻辑只基于标准化后的配置与订阅工作。agent 工具层保留旧参数表面兼容，但内部立即转换。

**Tech Stack:** TypeScript, Node test runner (`node:test` via `tsx --test`)

---

### Task 1: Compat Adapter 测试先行

**Files:**
- Modify: `tests/logic.test.ts`
- Create: `tests/compat.smoke.test.ts`

**Step 1: Write the failing test**

- 为配置解析补测试，断言旧字段会被规范化成新版字段。
- 为订阅链路补 smoke test，断言旧输入最终只保留新版字段。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/logic.test.ts tests/compat.smoke.test.ts`

Expected: FAIL，因为 compat adapter 及其调用点尚未实现。

### Task 2: Compat Adapter 实现

**Files:**
- Create: `src/compat.ts`
- Modify: `src/config.ts`
- Modify: `src/manager.ts`
- Modify: `src/tmux-watch-tool.ts`

**Step 1: Write minimal implementation**

- 新增 timing 规范化 helper。
- 配置解析输出标准 timing 字段。
- 订阅输入 sanitize 时完成 legacy -> canonical 转换。
- manager 解析 interval/stable 时只消费标准字段。

**Step 2: Run targeted tests**

Run: `npm test -- tests/logic.test.ts tests/compat.smoke.test.ts`

Expected: PASS

### Task 3: 文档与完整验证

**Files:**
- Modify: `README.md`

**Step 1: Update docs**

- 将旧字段标为 legacy compatibility。
- 强调推荐只使用新版字段。

**Step 2: Run full verification**

Run: `npm run check`

Expected: PASS
