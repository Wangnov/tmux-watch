import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseTmuxPaneList, setupTmuxWatch } from "../src/cli.js";

function createApi(stateDir: string) {
  let writtenConfig: Record<string, unknown> | null = null;
  const initialConfig: Record<string, unknown> = {};
  return {
    api: {
      pluginConfig: { enabled: true },
      config: {
        session: { mainKey: "main" },
        agents: { list: [{ id: "main", default: true }] },
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
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
          loadConfig: () => initialConfig,
          writeConfigFile: async (cfg: Record<string, unknown>) => {
            writtenConfig = cfg;
          },
        },
      },
    },
    getWrittenConfig: () => writtenConfig,
  };
}

test("parseTmuxPaneList parses pane metadata from tmux list-panes output", () => {
  const panes = parseTmuxPaneList(
    [
      "work:0.0\twork\teditor\tmain\tvim",
      "work:0.1\twork\teditor\trunner\tnode",
    ].join("\n"),
  );

  assert.deepEqual(panes, [
    {
      target: "work:0.0",
      sessionName: "work",
      windowName: "editor",
      paneTitle: "main",
      currentCommand: "vim",
    },
    {
      target: "work:0.1",
      sessionName: "work",
      windowName: "editor",
      paneTitle: "runner",
      currentCommand: "node",
    },
  ]);
});

test("setupTmuxWatch writes config and creates a subscription in one step", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-cli-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const { api, getWrittenConfig } = createApi(stateDir);
  const result = await setupTmuxWatch({
    api: api as never,
    logger: api.logger,
    socket: "/tmp/tmux.sock",
    target: "work:0.1",
    label: "runner",
    note: "watch the build pane",
  });

  assert.equal(result.socket, "/tmp/tmux.sock");
  assert.equal(result.subscription.target, "work:0.1");
  assert.equal(result.subscription.label, "runner");

  const writtenConfig = getWrittenConfig() as {
    plugins?: {
      entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
    };
  };
  assert.equal(
    writtenConfig.plugins?.entries?.["tmux-watch"]?.config?.socket,
    "/tmp/tmux.sock",
  );

  const persisted = JSON.parse(
    await fs.readFile(path.join(stateDir, "tmux-watch", "subscriptions.json"), "utf8"),
  ) as {
    subscriptions: Array<{ id?: string; target: string; label?: string; note?: string; socket?: string }>;
  };
  assert.equal(persisted.subscriptions.length, 1);
  assert.equal(typeof persisted.subscriptions[0]?.id, "string");
  assert.equal(persisted.subscriptions[0]?.target, "work:0.1");
  assert.equal(persisted.subscriptions[0]?.label, "runner");
  assert.equal(persisted.subscriptions[0]?.note, "watch the build pane");
  assert.equal(persisted.subscriptions[0]?.socket, "/tmp/tmux.sock");
});
