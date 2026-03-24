import assert from "node:assert/strict";
import test from "node:test";
import type { TmuxWatchConfig } from "../src/config.js";
import {
  DEFAULT_CAPTURE_INTERVAL_SECONDS,
  DEFAULT_STABLE_COUNT,
  resolveTmuxWatchConfig,
} from "../src/config.js";
import {
  resolveIntervalMs,
  resolveStableCount,
  resolveStableDurationSeconds,
  resolveLastTargetsFromStore,
  stripAnsi,
  truncateOutput,
} from "../src/manager.js";

type PartialConfig = Partial<TmuxWatchConfig>;

function makeConfig(overrides: PartialConfig = {}): TmuxWatchConfig {
  return {
    enabled: true,
    captureIntervalSeconds: DEFAULT_CAPTURE_INTERVAL_SECONDS,
    stableCount: DEFAULT_STABLE_COUNT,
    cooldownSeconds: 120,
    minOutputChars: 8,
    ignoreWhitespaceOnlyChanges: true,
    captureLines: 200,
    stripAnsi: true,
    maxOutputChars: 4000,
    sessionKey: undefined,
    socket: undefined,
    notify: {
      mode: "targets",
      targets: [],
    },
    ...overrides,
  };
}

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    target: "session:0.0",
    ...overrides,
  };
}

test("resolveTmuxWatchConfig normalizes legacy timing fields into canonical fields", () => {
  const cfg = resolveTmuxWatchConfig({
    pollIntervalMs: 2500,
    stableSeconds: 10,
  });

  assert.equal(cfg.captureIntervalSeconds, 2.5);
  assert.equal(cfg.stableCount, 4);
  assert.equal("pollIntervalMs" in cfg, false);
  assert.equal("stableSeconds" in cfg, false);
});

test("resolveTmuxWatchConfig keeps canonical timing fields ahead of legacy fallbacks", () => {
  const cfg = resolveTmuxWatchConfig({
    captureIntervalSeconds: 3,
    pollIntervalMs: 2500,
    stableCount: 5,
    stableSeconds: 10,
  });

  assert.equal(cfg.captureIntervalSeconds, 3);
  assert.equal(cfg.stableCount, 5);
});

test("resolveIntervalMs prefers subscription captureIntervalSeconds over config", () => {
  const cfg = makeConfig({ captureIntervalSeconds: 2 });
  assert.equal(resolveIntervalMs(makeSub(), cfg), 2000);
  assert.equal(
    resolveIntervalMs(makeSub({ captureIntervalSeconds: 3 }), cfg),
    3000,
  );
});

test("resolveIntervalMs falls back to default when no interval is configured", () => {
  const cfg = makeConfig({ captureIntervalSeconds: DEFAULT_CAPTURE_INTERVAL_SECONDS });
  assert.equal(
    resolveIntervalMs(makeSub(), cfg),
    DEFAULT_CAPTURE_INTERVAL_SECONDS * 1000,
  );
});

test("resolveStableCount uses stableCount when provided", () => {
  const cfg = makeConfig({ captureIntervalSeconds: 3, stableCount: 5 });
  assert.equal(resolveStableCount(makeSub(), cfg), 5);
});

test("resolveStableCount lets subscription override normalized config", () => {
  const cfg = makeConfig({ captureIntervalSeconds: 3, stableCount: 5 });
  assert.equal(resolveStableCount(makeSub({ stableCount: 7 }), cfg), 7);
});

test("resolveStableCount falls back to default", () => {
  const cfg = makeConfig({ stableCount: DEFAULT_STABLE_COUNT });
  assert.equal(resolveStableCount(makeSub(), cfg), DEFAULT_STABLE_COUNT);
});

test("resolveStableDurationSeconds uses interval * stableCount", () => {
  const cfg = makeConfig({ captureIntervalSeconds: 3, stableCount: 5 });
  assert.equal(resolveStableDurationSeconds(makeSub(), cfg), 15);
});

test("stripAnsi removes SGR and OSC8 sequences", () => {
  const text = "\u001b[31mred\u001b[0m \u001b]8;;https://example.com\u001b\\link\u001b]8;;\u001b\\";
  assert.equal(stripAnsi(text), "red link");
});

test("truncateOutput keeps tail content and marks truncation", () => {
  const text = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
  const result = truncateOutput(text, 40);
  assert.equal(result.truncated, true);
  assert.ok(result.text.startsWith("...[truncated]\n"));
  const lines = result.text.split("\n");
  assert.equal(lines[0], "...[truncated]");
  assert.equal(lines[lines.length - 1], "line20");
  assert.notEqual(lines[1], "line1");
});

test("truncateOutput leaves short text untouched", () => {
  const text = "short line";
  const result = truncateOutput(text, 200);
  assert.equal(result.truncated, false);
  assert.equal(result.text, text);
});

test("resolveLastTargetsFromStore replaces webchat last with latest external", () => {
  const store = {
    "agent:main:main": {
      updatedAt: 5,
      deliveryContext: { channel: "webchat", to: "webchat:client" },
    },
    "agent:main:gewe": {
      updatedAt: 3,
      deliveryContext: { channel: "gewe-openclaw", to: "gewe-openclaw:wxid_a" },
    },
    "agent:main:telegram": {
      updatedAt: 4,
      deliveryContext: { channel: "telegram", to: "123" },
    },
  };
  const targets = resolveLastTargetsFromStore({
    store,
    sessionKey: "agent:main:main",
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.channel, "telegram");
});

test("resolveLastTargetsFromStore uses last external directly", () => {
  const store = {
    "agent:main:main": {
      updatedAt: 5,
      deliveryContext: { channel: "gewe-openclaw", to: "gewe-openclaw:wxid_a" },
    },
    "agent:main:web": {
      updatedAt: 6,
      deliveryContext: { channel: "webchat", to: "webchat:client" },
    },
  };
  const targets = resolveLastTargetsFromStore({
    store,
    sessionKey: "agent:main:main",
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.channel, "gewe-openclaw");
});
