import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  DEFAULT_STABLE_COUNT,
  normalizeTimingCompat,
} from "./compat.js";

export type NotifyMode = "last" | "targets" | "targets+last";

export type NotifyTarget = {
  channel: string;
  target: string;
  accountId?: string;
  threadId?: string;
  label?: string;
};

export type TmuxWatchHostProfile = {
  sshCommand: string;
  socket?: string;
};

export type TmuxWatchConfig = {
  enabled: boolean;
  captureIntervalSeconds: number;
  stableCount: number;
  cooldownSeconds: number;
  minOutputChars: number;
  ignoreWhitespaceOnlyChanges: boolean;
  captureLines: number;
  stripAnsi: boolean;
  maxOutputChars: number;
  sessionKey?: string;
  socket?: string;
  hosts: Record<string, TmuxWatchHostProfile>;
  notify: {
    mode: NotifyMode;
    targets: NotifyTarget[];
  };
};

export const DEFAULT_COOLDOWN_SECONDS = 120;
export const DEFAULT_MIN_OUTPUT_CHARS = 8;
export const DEFAULT_IGNORE_WHITESPACE_ONLY_CHANGES = true;

const DEFAULTS: Omit<TmuxWatchConfig, "captureIntervalSeconds" | "stableCount"> = {
  enabled: true,
  cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
  minOutputChars: DEFAULT_MIN_OUTPUT_CHARS,
  ignoreWhitespaceOnlyChanges: DEFAULT_IGNORE_WHITESPACE_ONLY_CHANGES,
  captureLines: 50,
  stripAnsi: true,
  maxOutputChars: 4000,
  sessionKey: undefined,
  socket: undefined,
  hosts: {},
  notify: {
    mode: "last",
    targets: [],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return fallback;
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function readString(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNotifyMode(raw: unknown, fallback: NotifyMode): NotifyMode {
  if (raw === "last" || raw === "targets" || raw === "targets+last") {
    return raw;
  }
  return fallback;
}

function normalizeTargets(raw: unknown): NotifyTarget[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const targets: NotifyTarget[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    const channel = readString(entry.channel);
    const target = readString(entry.target);
    if (!channel || !target) {
      continue;
    }
    targets.push({
      channel,
      target,
      accountId: readString(entry.accountId),
      threadId: readString(entry.threadId),
      label: readString(entry.label),
    });
  }
  return targets;
}

function normalizeHosts(raw: unknown): Record<string, TmuxWatchHostProfile> {
  if (!isRecord(raw)) {
    return {};
  }
  const hosts: Record<string, TmuxWatchHostProfile> = {};
  for (const [name, value] of Object.entries(raw)) {
    const normalizedName = readString(name);
    if (!normalizedName || !isRecord(value)) {
      continue;
    }
    const sshCommand = readString(value.sshCommand);
    if (!sshCommand) {
      continue;
    }
    hosts[normalizedName] = {
      sshCommand,
      socket: readString(value.socket),
    };
  }
  return hosts;
}

export function resolveTmuxWatchConfig(raw: unknown): TmuxWatchConfig {
  const value = isRecord(raw) ? raw : {};
  const notifyRaw = isRecord(value.notify) ? value.notify : {};
  const timing = normalizeTimingCompat(value);

  const captureLines = Math.max(10, readNumber(value.captureLines, DEFAULTS.captureLines));
  const maxOutputChars = Math.max(200, readNumber(value.maxOutputChars, DEFAULTS.maxOutputChars));

  return {
    enabled: readBoolean(value.enabled, DEFAULTS.enabled),
    captureIntervalSeconds: timing.captureIntervalSeconds,
    stableCount: timing.stableCount,
    cooldownSeconds: Math.max(0, readNumber(value.cooldownSeconds, DEFAULTS.cooldownSeconds)),
    minOutputChars: Math.max(0, readNumber(value.minOutputChars, DEFAULTS.minOutputChars)),
    ignoreWhitespaceOnlyChanges: readBoolean(
      value.ignoreWhitespaceOnlyChanges,
      DEFAULTS.ignoreWhitespaceOnlyChanges,
    ),
    captureLines,
    stripAnsi: readBoolean(value.stripAnsi, DEFAULTS.stripAnsi),
    maxOutputChars,
    sessionKey: readString(value.sessionKey) ?? DEFAULTS.sessionKey,
    socket: readString(value.socket) ?? DEFAULTS.socket,
    hosts: normalizeHosts(value.hosts),
    notify: {
      mode: normalizeNotifyMode(notifyRaw.mode, DEFAULTS.notify.mode),
      targets: normalizeTargets(notifyRaw.targets),
    },
  };
}

export { DEFAULT_CAPTURE_INTERVAL_SECONDS, DEFAULT_STABLE_COUNT };
