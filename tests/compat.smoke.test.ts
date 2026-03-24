import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTmuxWatchManager } from "../src/manager.js";
import { createTmuxWatchTool } from "../src/tmux-watch-tool.js";

function createApi(stateDir: string, pluginConfig: unknown) {
  return {
    pluginConfig,
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

function resolveStatePath(stateDir: string): string {
  return path.join(stateDir, "tmux-watch", "subscriptions.json");
}

test("smoke: new and legacy tool inputs both end up in canonical subscription timing fields", async (t) => {
  const newStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-new-"));
  const legacyStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-legacy-"));
  t.after(async () => {
    await fs.rm(newStateDir, { recursive: true, force: true });
    await fs.rm(legacyStateDir, { recursive: true, force: true });
  });

  const newManager = createTmuxWatchManager(
    createApi(newStateDir, {
      enabled: true,
      captureIntervalSeconds: 3,
      stableCount: 5,
    }) as never,
  );
  const legacyManager = createTmuxWatchManager(
    createApi(legacyStateDir, {
      enabled: true,
      pollIntervalMs: 3000,
      stableSeconds: 15,
    }) as never,
  );

  const newTool = createTmuxWatchTool(newManager);
  const legacyTool = createTmuxWatchTool(legacyManager);

  const newResult = await newTool.execute("test-new", {
    action: "add",
    target: "session:0.0",
    captureIntervalSeconds: 4,
    stableCount: 6,
  });
  const legacyResult = await legacyTool.execute("test-legacy", {
    action: "add",
    target: "session:0.0",
    intervalMs: 4000,
    stableSeconds: 24,
  });

  const newSubscription = (newResult.details as { subscription: Record<string, unknown> }).subscription;
  const legacySubscription = (legacyResult.details as { subscription: Record<string, unknown> }).subscription;

  assert.equal(newSubscription.captureIntervalSeconds, 4);
  assert.equal(newSubscription.stableCount, 6);
  assert.equal(newSubscription.intervalMs, undefined);
  assert.equal(newSubscription.stableSeconds, undefined);

  assert.equal(legacySubscription.captureIntervalSeconds, 4);
  assert.equal(legacySubscription.stableCount, 6);
  assert.equal(legacySubscription.intervalMs, undefined);
  assert.equal(legacySubscription.stableSeconds, undefined);

  const legacyState = JSON.parse(await fs.readFile(resolveStatePath(legacyStateDir), "utf8")) as {
    subscriptions: Array<Record<string, unknown>>;
  };
  assert.equal(legacyState.subscriptions[0]?.captureIntervalSeconds, 4);
  assert.equal(legacyState.subscriptions[0]?.stableCount, 6);
  assert.equal("intervalMs" in (legacyState.subscriptions[0] ?? {}), false);
  assert.equal("stableSeconds" in (legacyState.subscriptions[0] ?? {}), false);
});
