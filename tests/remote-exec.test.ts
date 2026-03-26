import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveTmuxWatchConfig } from "../src/config.js";
import { captureTmux } from "../src/capture.js";
import { createTmuxWatchManager } from "../src/manager.js";
import { createTmuxWatchTool } from "../src/tmux-watch-tool.js";
import { buildRemoteTmuxShellCommand } from "../src/tmux-exec.js";

function createApi(
  stateDir: string,
  pluginConfig: Record<string, unknown> = {},
  options?: {
    runCommandWithTimeout?: (argv: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  },
) {
  const commands: string[][] = [];
  return {
    commands,
    api: {
      pluginConfig: {
        enabled: true,
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
          runCommandWithTimeout: async (argv: string[]) => {
            commands.push(argv);
            if (options?.runCommandWithTimeout) {
              return options.runCommandWithTimeout(argv);
            }
            return { code: 0, stdout: "remote output", stderr: "" };
          },
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
    },
  };
}

test("resolveTmuxWatchConfig parses remote host profiles", () => {
  const cfg = resolveTmuxWatchConfig({
    hosts: {
      devbox: {
        sshCommand: "ssh devbox",
        socket: "/tmp/remote.sock",
      },
    },
  });

  assert.equal(cfg.hosts.devbox?.sshCommand, "ssh devbox");
  assert.equal(cfg.hosts.devbox?.socket, "/tmp/remote.sock");
});

test("captureTmux uses remote ssh command when host is specified", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-remote-capture-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const { api, commands } = createApi(stateDir, {
    hosts: {
      devbox: {
        sshCommand: "ssh devbox",
        socket: "/tmp/remote.sock",
      },
    },
  });

  const result = await captureTmux({
    api: api as never,
    config: resolveTmuxWatchConfig(api.pluginConfig),
    host: "devbox",
    target: "work:0.1",
  } as never);

  assert.equal(result.text, "remote output");
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.[0], "bash");
  assert.equal(commands[0]?.[1], "-lc");
  assert.match(commands[0]?.[2] ?? "", /ssh devbox/);
  assert.match(commands[0]?.[2] ?? "", /tmux/);
  assert.match(commands[0]?.[2] ?? "", /\/tmp\/remote\.sock/);
});

test("tmux-watch tool add stores remote host on the subscription", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-remote-tool-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const { api } = createApi(stateDir, {
    hosts: {
      devbox: {
        sshCommand: "ssh devbox",
      },
    },
  });
  const manager = createTmuxWatchManager(api as never);
  const tool = createTmuxWatchTool(manager);

  const result = await tool.execute("remote-add", {
    action: "add",
    host: "devbox",
    target: "work:0.1",
    label: "remote",
  } as never);

  const subscription = (result.details as { subscription: Record<string, unknown> }).subscription;
  assert.equal(subscription.host, "devbox");
});

test("manager capture uses remote ssh when the subscription has a host", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-remote-manager-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const { api, commands } = createApi(stateDir, {
    hosts: {
      devbox: {
        sshCommand: "ssh devbox",
        socket: "/tmp/remote.sock",
      },
    },
  });
  const manager = createTmuxWatchManager(api as never) as never as {
    capture: (params: Record<string, unknown>) => Promise<{ text?: string }>;
  };

  const result = await manager.capture({
    host: "devbox",
    target: "work:0.1",
  });

  assert.equal(result.text, "remote output");
  assert.equal(commands[0]?.[0], "bash");
  assert.match(commands[0]?.[2] ?? "", /ssh devbox/);
});

test("manager capture does not require local tmux when using a remote host profile", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-remote-host-only-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const { api, commands } = createApi(
    stateDir,
    {
      hosts: {
        devbox: {
          sshCommand: "ssh devbox",
          socket: "/tmp/remote.sock",
        },
      },
    },
    {
      runCommandWithTimeout: async (argv: string[]) => {
        if (argv[0] === "tmux" && argv[1] === "-V") {
          return { code: 1, stdout: "", stderr: "tmux missing locally" };
        }
        return { code: 0, stdout: "remote output", stderr: "" };
      },
    },
  );
  const manager = createTmuxWatchManager(api as never) as never as {
    capture: (params: Record<string, unknown>) => Promise<{ text?: string }>;
  };

  const result = await manager.capture({
    host: "devbox",
    target: "work:0.1",
  });

  assert.equal(result.text, "remote output");
  assert.equal(commands.some((argv) => argv[0] === "tmux" && argv[1] === "-V"), false);
  assert.equal(commands[0]?.[0], "bash");
  assert.match(commands[0]?.[2] ?? "", /ssh devbox/);
});

test("buildRemoteTmuxShellCommand preserves spaced tmux arguments over ssh", () => {
  const cmd = buildRemoteTmuxShellCommand("ssh devbox", undefined, [
    "send-keys",
    "-t",
    "work:0.1",
    "-l",
    "--",
    "echo remote smoke tick-4",
  ]);

  assert.match(cmd, /^ssh devbox -- /);
  assert.match(cmd, /'echo remote smoke tick-4'/);
  assert.doesNotMatch(cmd, /ssh devbox 'tmux'/);
});
