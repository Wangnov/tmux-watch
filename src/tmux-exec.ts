import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { TmuxWatchConfig, TmuxWatchHostProfile } from "./config.js";

export type RunTmuxCommandParams = {
  api: OpenClawPluginApi;
  config: TmuxWatchConfig;
  host?: string;
  socket?: string;
  tmuxArgs: string[];
  timeoutMs: number;
};

export function shellQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

export function resolveHostProfile(
  config: TmuxWatchConfig,
  host: string | undefined,
): TmuxWatchHostProfile | undefined {
  if (!host) {
    return undefined;
  }
  const normalized = host.trim();
  if (!normalized) {
    return undefined;
  }
  const profile = config.hosts[normalized];
  if (!profile) {
    throw new Error(`Unknown tmux-watch host: ${normalized}`);
  }
  return profile;
}

export function resolveSocketForTmuxCommand(params: {
  config: TmuxWatchConfig;
  host?: string;
  socket?: string;
}): string | undefined {
  const explicitSocket = normalizeSocket(params.socket);
  if (explicitSocket) {
    return explicitSocket;
  }
  const profile = resolveHostProfile(params.config, params.host);
  if (profile) {
    return normalizeSocket(profile.socket);
  }
  return normalizeSocket(params.config.socket);
}

export function buildLocalTmuxArgv(socket: string | undefined, tmuxArgs: string[]): string[] {
  return socket ? ["tmux", "-S", socket, ...tmuxArgs] : ["tmux", ...tmuxArgs];
}

export function buildRemoteTmuxShellCommand(
  sshCommand: string,
  socket: string | undefined,
  tmuxArgs: string[],
): string {
  const remoteCommand = buildLocalTmuxArgv(socket, tmuxArgs).map(shellQuote).join(" ");
  return `${sshCommand} -- ${shellQuote(remoteCommand)}`;
}

export async function runTmuxCommand(params: RunTmuxCommandParams) {
  const socket = resolveSocketForTmuxCommand(params);
  const profile = resolveHostProfile(params.config, params.host);
  if (!profile) {
    return params.api.runtime.system.runCommandWithTimeout(
      buildLocalTmuxArgv(socket, params.tmuxArgs),
      { timeoutMs: params.timeoutMs },
    );
  }
  const cmd = buildRemoteTmuxShellCommand(profile.sshCommand, socket, params.tmuxArgs);
  return params.api.runtime.system.runCommandWithTimeout(["bash", "-lc", cmd], {
    timeoutMs: params.timeoutMs,
  });
}

function normalizeSocket(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    return trimmed.slice(0, comma);
  }
  return trimmed;
}
