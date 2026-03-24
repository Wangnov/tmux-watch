import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTmuxWatchManager } from "../src/manager.js";

function createApi(stateDir: string, pluginConfig: Record<string, unknown> = {}) {
  return {
    pluginConfig: {
      enabled: true,
      captureIntervalSeconds: 1,
      stableCount: 1,
      ...pluginConfig,
    },
    config: {
      session: { mainKey: "main" },
      agents: { list: [{ id: "main", default: true }] },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    registerTool: () => {},
    registerService: () => {},
    registerCli: () => {},
    runtime: {
      state: {
        resolveStateDir: () => stateDir,
      },
      system: {
        runCommandWithTimeout: async () => ({ code: 0, stdout: "", stderr: "" }),
      },
      channel: {
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: async () => {},
        },
        session: {
          resolveStorePath: () => path.join(stateDir, "agents", "main", "sessions", "sessions.json"),
        },
      },
      config: {
        loadConfig: () => ({}),
        writeConfigFile: async () => {},
      },
    },
  };
}

async function createWatchHarness(pluginConfig: Record<string, unknown> = {}) {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-denoise-"));
  const api = createApi(stateDir, pluginConfig);
  const manager = createTmuxWatchManager(api as never) as never as {
    addSubscription: (input: Record<string, unknown>) => Promise<{ id: string }>;
    entries: Map<string, unknown>;
    pollWatch: (entry: unknown) => Promise<void>;
    captureOutput: (entry: unknown) => Promise<string | null>;
    notifyStable: (subscription: unknown, output: string) => Promise<void>;
    tmuxAvailable: boolean;
  };
  manager.tmuxAvailable = true;

  return {
    stateDir,
    manager,
    cleanup: async () => {
      await fs.rm(stateDir, { recursive: true, force: true });
    },
  };
}

test("manager cooldown suppresses repeated notifications after a brief recovery", async (t) => {
  const harness = await createWatchHarness({ cooldownSeconds: 60, minOutputChars: 0 });
  t.after(harness.cleanup);

  const subscription = await harness.manager.addSubscription({
    id: "sub-1",
    target: "work:0.0",
  });
  const entry = harness.manager.entries.get(subscription.id);

  const outputs = ["stuck", "stuck", "working", "stuck", "stuck"];
  const notified: string[] = [];
  harness.manager.captureOutput = async () => outputs.shift() ?? null;
  harness.manager.notifyStable = async (_subscription, output) => {
    notified.push(output);
  };

  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });

  await harness.manager.pollWatch(entry);
  now += 1_000;
  await harness.manager.pollWatch(entry);
  now += 1_000;
  await harness.manager.pollWatch(entry);
  now += 1_000;
  await harness.manager.pollWatch(entry);
  now += 1_000;
  await harness.manager.pollWatch(entry);

  assert.deepEqual(notified, ["stuck"]);
});

test("manager skips notifications when output is shorter than minOutputChars", async (t) => {
  const harness = await createWatchHarness({ minOutputChars: 5 });
  t.after(harness.cleanup);

  const subscription = await harness.manager.addSubscription({
    id: "sub-1",
    target: "work:0.0",
  });
  const entry = harness.manager.entries.get(subscription.id);

  const outputs = ["ok", "ok", "ok"];
  let notifyCount = 0;
  harness.manager.captureOutput = async () => outputs.shift() ?? null;
  harness.manager.notifyStable = async () => {
    notifyCount += 1;
  };

  await harness.manager.pollWatch(entry);
  await harness.manager.pollWatch(entry);
  await harness.manager.pollWatch(entry);

  assert.equal(notifyCount, 0);
});

test("manager treats whitespace-only output changes as the same content when enabled", async (t) => {
  const harness = await createWatchHarness({ ignoreWhitespaceOnlyChanges: true });
  t.after(harness.cleanup);

  const subscription = await harness.manager.addSubscription({
    id: "sub-1",
    target: "work:0.0",
  });
  const entry = harness.manager.entries.get(subscription.id);

  const outputs = ["build done", "build   done  ", "build done"];
  let notifyCount = 0;
  harness.manager.captureOutput = async () => outputs.shift() ?? null;
  harness.manager.notifyStable = async () => {
    notifyCount += 1;
  };

  await harness.manager.pollWatch(entry);
  await harness.manager.pollWatch(entry);
  await harness.manager.pollWatch(entry);

  assert.equal(notifyCount, 1);
});
