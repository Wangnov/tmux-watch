import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";
import {
  registerTmuxWatchCli,
  saveTmuxWatchHostProfile,
  removeTmuxWatchHostProfile,
  testTmuxWatchHostProfile,
} from "../src/cli.js";

function createApi() {
  let writtenConfig: Record<string, unknown> | null = null;
  const commands: Array<{ argv: string[]; timeoutMs?: number }> = [];
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    commands,
    infos,
    errors,
    api: {
      pluginConfig: { enabled: true },
      config: {
        session: { mainKey: "main" },
        agents: { list: [{ id: "main", default: true }] },
      },
      logger: {
        info: (message: string) => {
          infos.push(message);
        },
        warn: () => {},
        error: (message: string) => {
          errors.push(message);
        },
      },
      runtime: {
        state: {
          resolveStateDir: () => "/tmp/tmux-watch-cli-host",
        },
        system: {
          runCommandWithTimeout: async (
            argv: string[],
            options?: { timeoutMs?: number },
          ) => {
            commands.push({ argv, timeoutMs: options?.timeoutMs });
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
  assert.equal(commands[0]?.argv[0], "bash");
  assert.equal(commands[0]?.argv[1], "-lc");
  assert.match(commands[0]?.argv[2] ?? "", /ssh oldbox/);
  assert.match(commands[0]?.argv[2] ?? "", /tmux/);
  assert.match(commands[0]?.argv[2] ?? "", /-V/);
});

test("remote tmux-watch send gives the Enter step enough timeout budget", async () => {
  const { api, commands, errors } = createApi();
  api.runtime.config.loadConfig = (() => ({
    plugins: {
      entries: {
        "tmux-watch": {
          enabled: true,
          config: {
            hosts: {
              "oracle-sjc": {
                sshCommand: "ssh oracle-sjc",
              },
            },
          },
        },
      },
    },
  })) as never;
  api.runtime.system.runCommandWithTimeout = async (
    argv: string[],
    options?: { timeoutMs?: number },
  ) => {
    commands.push({ argv, timeoutMs: options?.timeoutMs });
    const command = argv[2] ?? "";
    if (command.includes("'C-m'") || command.includes("C-m")) {
      if ((options?.timeoutMs ?? 0) < 3000) {
        return { code: 124, stdout: "", stderr: "Timed out after 2000ms" };
      }
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  const program = new Command();
  registerTmuxWatchCli({
    program,
    api: api as never,
    logger: api.logger,
  });

  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  await program.parseAsync(
    ["tmux-watch", "send", "--host", "oracle-sjc", "work:0.1", "echo", "remote", "smoke"],
    { from: "user" },
  );

  assert.equal(process.exitCode, 0);
  assert.equal(errors.length, 0);
  assert.equal(commands.length, 2);
  assert.equal(commands[1]?.timeoutMs && commands[1].timeoutMs >= 3000, true);

  process.exitCode = previousExitCode;
});
