import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTmuxWatchManager } from "./manager.js";
import { installTool, removeTool, type ToolId } from "./tool-install.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type PluginsConfig = {
  enabled?: boolean;
  entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
};

export type TmuxPaneChoice = {
  target: string;
  sessionName: string;
  windowName?: string;
  paneTitle?: string;
  currentCommand?: string;
};

function extractSocket(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    return trimmed.slice(0, comma);
  }
  return trimmed;
}

function printSocketHelp(logger: Logger) {
  logger.info("How to find the tmux socket:");
  logger.info("  1) Enter the target tmux session.");
  logger.info("  2) Run: echo $TMUX");
  logger.info("  3) Use the path before the first comma as the socket.");
  logger.info("Example: /private/tmp/tmux-501/default,3191,4 -> /private/tmp/tmux-501/default");
}

async function promptSocket(logger: Logger): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("No TTY available for interactive prompt. Use --socket <path>.");
  }
  printSocketHelp(logger);
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("Paste tmux socket path (or full $TMUX value): ");
    return extractSocket(answer);
  } finally {
    rl.close();
  }
}

function resolveSocketFromEnv(): string | undefined {
  const env = process.env.TMUX;
  if (!env) {
    return undefined;
  }
  const socket = extractSocket(env);
  return socket || undefined;
}

function normalizeToolId(raw: string): ToolId {
  const normalized = raw.trim().toLowerCase();
  if (normalized !== "cryosnap" && normalized !== "freeze") {
    throw new Error("Tool must be cryosnap or freeze.");
  }
  return normalized as ToolId;
}

function normalizeDelayMs(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.trunc(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return fallback;
}

function normalizeNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}

export function parseTmuxPaneList(raw: string): TmuxPaneChoice[] {
  const panes: TmuxPaneChoice[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [target, sessionName, windowName, paneTitle, currentCommand] = trimmed.split("\t");
    if (!target || !sessionName) {
      continue;
    }
    panes.push({
      target,
      sessionName,
      windowName: windowName || undefined,
      paneTitle: paneTitle || undefined,
      currentCommand: currentCommand || undefined,
    });
  }
  return panes;
}

function describePane(pane: TmuxPaneChoice): string {
  const details = [pane.windowName, pane.paneTitle, pane.currentCommand]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
  return details ? `${pane.target} (${details})` : pane.target;
}

async function listTmuxPanes(
  api: OpenClawPluginApi,
  socket: string | undefined,
): Promise<TmuxPaneChoice[]> {
  const argv = socket
    ? ["tmux", "-S", socket, "list-panes", "-a", "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{window_name}\t#{pane_title}\t#{pane_current_command}"]
    : ["tmux", "list-panes", "-a", "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{window_name}\t#{pane_title}\t#{pane_current_command}"];
  const result = await api.runtime.system.runCommandWithTimeout(argv, {
    timeoutMs: 5000,
  });
  if (result.code !== 0) {
    const err = (result.stderr ?? result.stdout ?? "").trim();
    throw new Error(err ? `tmux list-panes failed: ${err}` : "tmux list-panes failed");
  }
  return parseTmuxPaneList(result.stdout ?? "");
}

async function promptText(question: string): Promise<string | undefined> {
  if (!process.stdin.isTTY) {
    return undefined;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    const trimmed = answer.trim();
    return trimmed || undefined;
  } finally {
    rl.close();
  }
}

async function promptPaneSelection(logger: Logger, panes: TmuxPaneChoice[]): Promise<TmuxPaneChoice> {
  if (!process.stdin.isTTY) {
    throw new Error("No TTY available for pane selection. Use --target <pane>.");
  }
  logger.info("Available tmux panes:");
  panes.forEach((pane, index) => {
    logger.info(`  ${index + 1}) ${describePane(pane)}`);
  });
  const answer = await promptText("Choose pane number: ");
  const selectedIndex = answer ? Number(answer) : Number.NaN;
  if (!Number.isFinite(selectedIndex) || selectedIndex < 1 || selectedIndex > panes.length) {
    throw new Error("Invalid pane selection.");
  }
  return panes[selectedIndex - 1]!;
}

export async function setupTmuxWatch(params: {
  api: OpenClawPluginApi;
  logger: Logger;
  socket: string;
  target: string;
  label?: string;
  note?: string;
}) {
  const { api, socket, target, label, note } = params;
  const cfg = api.runtime.config.loadConfig();
  const plugins = (cfg.plugins ?? {}) as PluginsConfig;
  const entries = { ...(plugins.entries ?? {}) };
  const entry = { ...(entries["tmux-watch"] ?? {}) };
  const entryConfig = { ...(entry.config ?? {}) };

  entry.enabled = true;
  entry.config = {
    ...entryConfig,
    socket,
  };

  entries["tmux-watch"] = entry;

  await api.runtime.config.writeConfigFile({
    ...cfg,
    plugins: {
      ...plugins,
      entries,
    },
  });

  const manager = createTmuxWatchManager(api);
  const subscription = await manager.addSubscription({
    target,
    label,
    note,
    socket,
  });

  return {
    socket,
    subscription,
  };
}

export function registerTmuxWatchCli(params: {
  program: Command;
  api: OpenClawPluginApi;
  logger: Logger;
}) {
  const { program, api, logger } = params;

  const root = program
    .command("tmux-watch")
    .description("tmux-watch plugin utilities")
    .addHelpText("after", () => "\nDocs: https://docs.openclaw.ai/cli/plugins\n");

  root
    .command("setup")
    .description("Configure tmux-watch and optionally create a subscription")
    .option("--socket <path>", "tmux socket path (or full $TMUX value)")
    .option("--target <target>", "tmux target to subscribe immediately")
    .option("--label <label>", "subscription label")
    .option("--note <note>", "subscription note")
    .action(async (options: { socket?: string; target?: string; label?: string; note?: string }) => {
      let socket = options.socket ? extractSocket(options.socket) : undefined;
      if (!socket) {
        socket = resolveSocketFromEnv();
      }
      if (!socket) {
        socket = await promptSocket(logger);
      }
      if (!socket) {
        throw new Error("Socket required. Re-run with --socket or provide it interactively.");
      }

      let target = options.target?.trim() || "";
      let label = options.label?.trim() || undefined;
      let note = options.note?.trim() || undefined;

      if (!target && process.stdin.isTTY) {
        const panes = await listTmuxPanes(api, socket);
        if (panes.length === 0) {
          throw new Error("No tmux panes found for onboarding.");
        }
        const selected = await promptPaneSelection(logger, panes);
        target = selected.target;
        if (!label) {
          label = (await promptText("Optional label (Enter to skip): ")) ?? undefined;
        }
        if (!note) {
          note = (await promptText("Optional note (Enter to skip): ")) ?? undefined;
        }
      }

      if (!target) {
        const cfg = api.runtime.config.loadConfig();
        const plugins = (cfg.plugins ?? {}) as PluginsConfig;
        const entries = { ...(plugins.entries ?? {}) };
        const entry = { ...(entries["tmux-watch"] ?? {}) };
        const entryConfig = { ...(entry.config ?? {}) };

        entry.enabled = true;
        entry.config = {
          ...entryConfig,
          socket,
        };

        entries["tmux-watch"] = entry;

        await api.runtime.config.writeConfigFile({
          ...cfg,
          plugins: {
            ...plugins,
            entries,
          },
        });

        logger.info(`tmux-watch configured. socket=${socket}`);
        logger.info("Re-run with --target or use an interactive TTY to create a subscription.");
        logger.info("Restart the Gateway for changes to take effect.");
        return;
      }

      const result = await setupTmuxWatch({
        api,
        logger,
        socket,
        target,
        label,
        note,
      });

      logger.info(`tmux-watch configured. socket=${result.socket}`);
      logger.info(`Subscription created for ${result.subscription.target}.`);
      logger.info("Restart the Gateway for changes to take effect.");
    });

  root
    .command("socket-help")
    .description("Print instructions for finding the tmux socket")
    .action(() => {
      printSocketHelp(logger);
    });

  root
    .command("send")
    .description("Send text to a tmux target (text then Enter)")
    .argument("[target]", "tmux target (session:window.pane or %pane_id)")
    .argument("[text...]", "text to send (can be multiple words)")
    .option("--target <target>", "tmux target (overrides positional)")
    .option("--text <text>", "text to send (overrides positional)")
    .option("--socket <path>", "tmux socket path (or full $TMUX value)")
    .option("--delay-ms <ms>", "delay between text and Enter (default: 20)", "20")
    .option("--no-enter", "do not send Enter after text")
    .action(
      async (
        targetArg: string | undefined,
        textArgs: string[] | undefined,
        options: {
          target?: string;
          text?: string;
          socket?: string;
          delayMs?: string;
          enter?: boolean;
        },
      ) => {
        const target = (options.target ?? targetArg ?? "").trim();
        const textFromArgs =
          Array.isArray(textArgs) && textArgs.length > 0 ? textArgs.join(" ") : "";
        const text = (options.text ?? textFromArgs ?? "").trim();
        if (!target || !text) {
          logger.error("Usage: openclaw tmux-watch send <target> <text> [--no-enter]");
          process.exitCode = 1;
          return;
        }

        const socket = options.socket
          ? extractSocket(options.socket)
          : resolveSocketFromEnv();
        const delayMs = normalizeDelayMs(options.delayMs, 20);
        const enter = options.enter !== false;

        const argvBase = socket ? ["tmux", "-S", socket] : ["tmux"];
        const sendText = [...argvBase, "send-keys", "-t", target, "-l", "--", text];
        const res = await api.runtime.system.runCommandWithTimeout(sendText, {
          timeoutMs: 5000,
        });
        if (res.code !== 0) {
          const err = (res.stderr ?? res.stdout ?? "").trim();
          logger.error(err ? `tmux send-keys failed: ${err}` : "tmux send-keys failed");
          process.exitCode = 1;
          return;
        }

        if (enter) {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          const sendEnter = [...argvBase, "send-keys", "-t", target, "C-m"];
          const resEnter = await api.runtime.system.runCommandWithTimeout(sendEnter, {
            timeoutMs: 2000,
          });
          if (resEnter.code !== 0) {
            const err = (resEnter.stderr ?? resEnter.stdout ?? "").trim();
            logger.error(err ? `tmux send-keys Enter failed: ${err}` : "tmux send-keys Enter failed");
            process.exitCode = 1;
            return;
          }
        }

        logger.info(`Sent to ${target}${enter ? " (Enter)" : ""}.`);
      },
    );

  root
    .command("capture")
    .description("Capture tmux output as text/image")
    .argument("[target]", "tmux target (session:window.pane or %pane_id)")
    .option("--target <target>", "tmux target (overrides positional)")
    .option("--socket <path>", "tmux socket path (or full $TMUX value)")
    .option("--lines <n>", "lines to capture (default: config)")
    .option("--strip-ansi", "strip ANSI for text output")
    .option("--keep-ansi", "keep ANSI in text output")
    .option("--format <format>", "text | image | both")
    .option("--image-format <format>", "png | svg | webp")
    .option("--output <path>", "image output path (optional)")
    .option("--base64", "include base64 for image output")
    .option("--ttl-seconds <n>", "temporary image TTL in seconds (default: 600)")
    .option("--max-chars <n>", "max characters for text output (default: config)")
    .action(
      async (
        targetArg: string | undefined,
        options: {
          target?: string;
          socket?: string;
          lines?: string;
          stripAnsi?: boolean;
          keepAnsi?: boolean;
          format?: string;
          imageFormat?: string;
          output?: string;
          base64?: boolean;
          ttlSeconds?: string;
          maxChars?: string;
        },
      ) => {
        const target = (options.target ?? targetArg ?? "").trim();
        if (!target) {
          logger.error("Usage: openclaw tmux-watch capture <target> [options]");
          process.exitCode = 1;
          return;
        }

        let stripAnsi: boolean | undefined;
        if (options.stripAnsi) {
          stripAnsi = true;
        } else if (options.keepAnsi) {
          stripAnsi = false;
        }

        try {
          const manager = createTmuxWatchManager(api);
          const result = await manager.capture({
            target,
            socket: options.socket ? extractSocket(options.socket) : undefined,
            captureLines: normalizeNumber(options.lines),
            stripAnsi,
            format: options.format,
            imageFormat: options.imageFormat,
            outputPath: options.output,
            base64: options.base64,
            ttlSeconds: normalizeNumber(options.ttlSeconds),
            maxChars: normalizeNumber(options.maxChars),
          });
          process.stdout.write(`${JSON.stringify({ ok: true, capture: result }, null, 2)}\n`);
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );

  root
    .command("install")
    .description("Install cryosnap or freeze into the OpenClaw tools directory")
    .argument("[tool]", "cryosnap or freeze", "cryosnap")
    .option("--force", "Replace existing tool binary")
    .action(async (tool: string, options: { force?: boolean }) => {
      const normalized = normalizeToolId(tool);
      const result = await installTool({
        tool: normalized,
        api,
        logger,
        force: Boolean(options.force),
      });
      const version = result.version ? ` (${result.version})` : "";
      logger.info(`Installed ${result.tool}${version}`);
      logger.info(`Path: ${result.path}`);
    });

  root
    .command("update")
    .description("Update cryosnap or freeze in the OpenClaw tools directory")
    .argument("[tool]", "cryosnap or freeze", "cryosnap")
    .action(async (tool: string) => {
      const normalized = normalizeToolId(tool);
      const result = await installTool({
        tool: normalized,
        api,
        logger,
        force: true,
      });
      const version = result.version ? ` (${result.version})` : "";
      logger.info(`Updated ${result.tool}${version}`);
      logger.info(`Path: ${result.path}`);
    });

  root
    .command("remove")
    .description("Remove cryosnap or freeze from the OpenClaw tools directory")
    .argument("[tool]", "cryosnap or freeze", "cryosnap")
    .action(async (tool: string) => {
      const normalized = normalizeToolId(tool);
      const result = await removeTool({
        tool: normalized,
        api,
        logger,
      });
      if (result.removed) {
        logger.info(`Removed ${result.tool}`);
      }
      logger.info(`Path: ${result.path}`);
    });
}
