import type {
  OpenClawPluginService,
  OpenClawPluginServiceContext,
} from "openclaw/plugin-sdk";
import type { TmuxWatchManager } from "./manager.js";

export function createTmuxWatchService(manager: TmuxWatchManager): OpenClawPluginService {
  return {
    id: "tmux-watch",
    async start(ctx: OpenClawPluginServiceContext) {
      await manager.start(ctx);
    },
    async stop() {
      await manager.stop();
    },
  };
}
