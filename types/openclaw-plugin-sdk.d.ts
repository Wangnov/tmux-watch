declare module "openclaw/plugin-sdk" {
  type TSchema = import("@sinclair/typebox").TSchema;
  export type OpenClawConfig = {
    session?: {
      store?: unknown;
      scope?: string;
      mainKey?: string;
    };
    agents?: {
      list?: Array<{ id?: string; default?: boolean }>;
    };
  } & Record<string, unknown>;

  export type OpenClawPluginServiceContext = {
    stateDir?: string;
  };

  export type OpenClawPluginService = {
    id: string;
    start?: (ctx: OpenClawPluginServiceContext) => Promise<void> | void;
    stop?: () => Promise<void> | void;
  };

  export type OpenClawPluginApi = {
    pluginConfig: unknown;
    config: OpenClawConfig;
    logger: {
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
    registerTool: (tool: unknown) => void;
    registerService: (service: OpenClawPluginService) => void;
    registerCli: (handler: (ctx: { program: unknown }) => void, opts?: { commands?: string[] }) => void;
    runtime: {
      state: {
        resolveStateDir: () => string;
      };
      system: {
        runCommandWithTimeout: (
          argv: string[],
          opts: { timeoutMs: number },
        ) => Promise<{ code: number; stdout?: string; stderr?: string }>;
      };
      channel: {
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: (args: {
            ctx: unknown;
            cfg: OpenClawConfig;
            dispatcherOptions: {
              deliver: () => Promise<void> | void;
              onError: (err: unknown) => void;
            };
          }) => Promise<void>;
        };
        session: {
          resolveStorePath: (store: unknown, opts: { agentId: string }) => string;
        };
      };
      config: {
        loadConfig: () => Record<string, unknown>;
        writeConfigFile: (cfg: Record<string, unknown>) => Promise<void>;
      };
    };
  };

  export function stringEnum<T extends readonly string[]>(
    values: T,
    opts?: { description?: string },
  ): TSchema;
}
