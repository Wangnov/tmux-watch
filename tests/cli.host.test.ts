import assert from "node:assert/strict";
import test from "node:test";
import {
  saveTmuxWatchHostProfile,
  removeTmuxWatchHostProfile,
  testTmuxWatchHostProfile,
} from "../src/cli.js";

function createApi() {
  let writtenConfig: Record<string, unknown> | null = null;
  const commands: string[][] = [];
  return {
    commands,
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
          resolveStateDir: () => "/tmp/tmux-watch-cli-host",
        },
        system: {
          runCommandWithTimeout: async (argv: string[]) => {
            commands.push(argv);
            return { code: 0, stdout: "tmux 3.4", stderr: "" };
          },
        },
        channel: {
          reply: {
            dispatchReplyWithBufferedBlockDispatcher: async () => {},
          },
          session: {
            resolveStorePath: () => "/tmp/tmux-watch-cli-host/sessions.json",
          },
        },
        config: {
          loadConfig: () => ({
            plugins: {
              entries: {
                "tmux-watch": {
                  enabled: true,
                  config: {
                    hosts: {
                      oldbox: {
                        sshCommand: "ssh oldbox",
                      },
                    },
                  },
                },
              },
            },
          }),
          writeConfigFile: async (cfg: Record<string, unknown>) => {
            writtenConfig = cfg;
          },
        },
      },
    },
    getWrittenConfig: () => writtenConfig,
  };
}

test("saveTmuxWatchHostProfile writes a remote host profile into plugin config", async () => {
  const { api, getWrittenConfig } = createApi();

  await saveTmuxWatchHostProfile({
    api: api as never,
    name: "devbox",
    sshCommand: "ssh devbox",
    socket: "/tmp/remote.sock",
  });

  const written = getWrittenConfig() as {
    plugins?: {
      entries?: Record<string, { config?: { hosts?: Record<string, { sshCommand?: string; socket?: string }> } }>;
    };
  };

  assert.equal(
    written.plugins?.entries?.["tmux-watch"]?.config?.hosts?.devbox?.sshCommand,
    "ssh devbox",
  );
  assert.equal(
    written.plugins?.entries?.["tmux-watch"]?.config?.hosts?.devbox?.socket,
    "/tmp/remote.sock",
  );
});

test("removeTmuxWatchHostProfile removes an existing host profile", async () => {
  const { api, getWrittenConfig } = createApi();

  await removeTmuxWatchHostProfile({
    api: api as never,
    name: "oldbox",
  });

  const written = getWrittenConfig() as {
    plugins?: {
      entries?: Record<string, { config?: { hosts?: Record<string, unknown> } }>;
    };
  };

  assert.equal("oldbox" in (written.plugins?.entries?.["tmux-watch"]?.config?.hosts ?? {}), false);
});

test("testTmuxWatchHostProfile runs tmux -V over the configured ssh command", async () => {
  const { api, commands } = createApi();

  const result = await testTmuxWatchHostProfile({
    api: api as never,
    name: "oldbox",
  });

  assert.equal(result.ok, true);
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.[0], "bash");
  assert.equal(commands[0]?.[1], "-lc");
  assert.match(commands[0]?.[2] ?? "", /ssh oldbox/);
  assert.match(commands[0]?.[2] ?? "", /tmux/);
  assert.match(commands[0]?.[2] ?? "", /-V/);
});
