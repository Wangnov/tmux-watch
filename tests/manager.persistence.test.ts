import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTmuxWatchManager } from "../src/manager.js";

type TestLogger = {
  infos: string[];
  warns: string[];
  errors: string[];
};

function createLogger(): TestLogger & {
  api: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
} {
  const infos: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    infos,
    warns,
    errors,
    api: {
      info: (message: string) => infos.push(message),
      warn: (message: string) => warns.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

function createApi(stateDir: string, logger = createLogger()) {
  return {
    logger,
    api: {
      pluginConfig: {
        enabled: true,
      },
      config: {
        session: { mainKey: "main" },
        agents: { list: [{ id: "main", default: true }] },
      },
      logger: logger.api,
      runtime: {
        state: {
          resolveStateDir: () => stateDir,
        },
        system: {
          runCommandWithTimeout: async (argv: string[]) => {
            if (argv[0] === "tmux" && argv[1] === "-V") {
              return { code: 1, stdout: "", stderr: "tmux unavailable in test" };
            }
            return { code: 0, stdout: "", stderr: "" };
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

function resolveStatePath(stateDir: string): string {
  return path.join(stateDir, "tmux-watch", "subscriptions.json");
}

test("manager quarantines malformed persisted state instead of silently reusing it", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-state-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const statePath = resolveStatePath(stateDir);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, "{invalid json", "utf8");

  const { api, logger } = createApi(stateDir);
  const manager = createTmuxWatchManager(api as never);

  await manager.start({ stateDir });
  const subscriptions = await manager.listSubscriptions({ includeOutput: false });

  assert.equal(subscriptions.length, 0);
  assert.ok(logger.warns.some((message) => message.includes("subscriptions.json")));

  const files = await fs.readdir(path.dirname(statePath));
  const backupName = files.find((fileName) => fileName.startsWith("subscriptions.json.corrupt-"));
  assert.ok(backupName, "expected malformed state file to be quarantined");

  const backupPath = path.join(path.dirname(statePath), backupName!);
  assert.equal(await fs.readFile(backupPath, "utf8"), "{invalid json");
  await assert.rejects(fs.access(statePath));
});

test("manager saveState does not write directly to the final subscriptions file", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "tmux-watch-state-"));
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const statePath = resolveStatePath(stateDir);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        version: 1,
        subscriptions: [{ id: "existing", target: "existing:0.0", label: "existing" }],
      },
      null,
      2,
    ),
    "utf8",
  );

  const originalWriteFile = fs.writeFile.bind(fs);
  t.after(() => {
    fs.writeFile = originalWriteFile;
  });

  fs.writeFile = (async (file, data, options) => {
    const filePath = typeof file === "string" ? file : file instanceof URL ? file.pathname : String(file);
    if (path.resolve(filePath) === path.resolve(statePath)) {
      await originalWriteFile(file as never, '{"broken":', options as never);
      throw new Error("simulated direct write crash");
    }
    return await originalWriteFile(file as never, data as never, options as never);
  }) as typeof fs.writeFile;

  const { api } = createApi(stateDir);
  const manager = createTmuxWatchManager(api as never);

  await manager.start({ stateDir });
  await assert.doesNotReject(
    manager.addSubscription({ id: "new", target: "new:0.0", label: "new" }),
  );

  const persisted = JSON.parse(await fs.readFile(statePath, "utf8")) as {
    version: number;
    subscriptions: Array<{ id: string }>;
  };
  assert.equal(persisted.version, 1);
  assert.deepEqual(
    persisted.subscriptions.map((entry) => entry.id).sort(),
    ["existing", "new"],
  );
});
