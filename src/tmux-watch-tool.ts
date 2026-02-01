import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { NotifyMode, NotifyTarget } from "./config.js";
import type { TmuxWatchManager, TmuxWatchSubscription } from "./manager.js";

const ACTIONS = ["add", "remove", "list"] as const;
const NOTIFY_MODES = ["last", "targets", "targets+last"] as const;

type ToolParams = {
  action: (typeof ACTIONS)[number];
  id?: string;
  target?: string;
  label?: string;
  note?: string;
  sessionKey?: string;
  socket?: string;
  captureIntervalSeconds?: number;
  intervalMs?: number;
  stableCount?: number;
  stableSeconds?: number;
  captureLines?: number;
  stripAnsi?: boolean;
  enabled?: boolean;
  notifyMode?: NotifyMode;
  targets?: NotifyTarget[];
  includeOutput?: boolean;
};

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details: unknown;
};

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTargets(raw: NotifyTarget[] | undefined): NotifyTarget[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const targets: NotifyTarget[] = [];
  for (const entry of raw) {
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
  return targets.length > 0 ? targets : undefined;
}

export function createTmuxWatchTool(manager: TmuxWatchManager) {
  return {
    name: "tmux-watch",
    description:
      "Manage tmux-watch subscriptions (add/remove/list) that monitor tmux pane output.",
    parameters: Type.Object(
      {
        action: stringEnum(ACTIONS, { description: `Action to perform: ${ACTIONS.join(", ")}` }),
        id: Type.Optional(Type.String({ description: "Subscription id." })),
        target: Type.Optional(Type.String({ description: "tmux target, e.g. session:0.0" })),
        label: Type.Optional(Type.String({ description: "Human-friendly label." })),
        note: Type.Optional(
          Type.String({ description: "Purpose/intent note shown to the agent on alert." }),
        ),
        sessionKey: Type.Optional(Type.String({ description: "Session key override." })),
        socket: Type.Optional(Type.String({ description: "tmux socket path (for -S)." })),
        captureIntervalSeconds: Type.Optional(
          Type.Number({ description: "Capture interval in seconds." }),
        ),
        intervalMs: Type.Optional(
          Type.Number({ description: "Legacy: capture interval in ms." }),
        ),
        stableCount: Type.Optional(
          Type.Number({ description: "Consecutive identical captures before alert." }),
        ),
        stableSeconds: Type.Optional(
          Type.Number({ description: "Legacy: stable duration in seconds." }),
        ),
        captureLines: Type.Optional(Type.Number({ description: "Lines to capture." })),
        stripAnsi: Type.Optional(Type.Boolean({ description: "Strip ANSI escape codes." })),
        enabled: Type.Optional(Type.Boolean({ description: "Enable or disable subscription." })),
        notifyMode: Type.Optional(
          stringEnum(NOTIFY_MODES, { description: "Notify mode override." }),
        ),
        targets: Type.Optional(
          Type.Array(
            Type.Object(
              {
                channel: Type.String({ description: "Channel id (e.g. telegram, gewe)." }),
                target: Type.String({ description: "Channel target id." }),
                accountId: Type.Optional(Type.String({ description: "Provider account id." })),
                threadId: Type.Optional(Type.String({ description: "Thread id." })),
                label: Type.Optional(Type.String({ description: "Label for this target." })),
              },
              { additionalProperties: false },
            ),
          ),
        ),
        includeOutput: Type.Optional(
          Type.Boolean({ description: "Include last captured output in list." }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(_id: string, params: ToolParams): Promise<ToolResult> {
      try {
        switch (params.action) {
          case "add": {
            const target = readString(params.target);
            if (!target) {
              throw new Error("target required for add action");
            }
            const subscription: Partial<TmuxWatchSubscription> & { target: string } = {
              id: readString(params.id),
              target,
              label: readString(params.label),
              note: readString(params.note),
              sessionKey: readString(params.sessionKey),
              socket: readString(params.socket),
              captureIntervalSeconds:
                typeof params.captureIntervalSeconds === "number"
                  ? params.captureIntervalSeconds
                  : undefined,
              intervalMs:
                typeof params.intervalMs === "number" ? params.intervalMs : undefined,
              stableCount:
                typeof params.stableCount === "number" ? params.stableCount : undefined,
              stableSeconds:
                typeof params.stableSeconds === "number" ? params.stableSeconds : undefined,
              captureLines:
                typeof params.captureLines === "number" ? params.captureLines : undefined,
              stripAnsi: typeof params.stripAnsi === "boolean" ? params.stripAnsi : undefined,
              enabled: typeof params.enabled === "boolean" ? params.enabled : undefined,
              notify:
                params.notifyMode || params.targets
                  ? {
                      mode: params.notifyMode,
                      targets: normalizeTargets(params.targets),
                    }
                  : undefined,
            };
            const created = await manager.addSubscription(subscription);
            return jsonResult({ ok: true, subscription: created });
          }
          case "remove": {
            const id = readString(params.id);
            if (!id) {
              throw new Error("id required for remove action");
            }
            const removed = await manager.removeSubscription(id);
            return jsonResult({ ok: removed });
          }
          case "list": {
            const items = await manager.listSubscriptions({
              includeOutput: params.includeOutput !== false,
            });
            return jsonResult({ ok: true, subscriptions: items });
          }
          default: {
            params.action satisfies never;
            throw new Error(`Unknown action: ${String(params.action)}`);
          }
        }
      } catch (err) {
        return jsonResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
