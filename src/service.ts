import type { OpenClawPluginService } from "openclaw/plugin-sdk";
import type { TmuxWatchManager } from "./manager.js";

export function createTmuxWatchService(manager: TmuxWatchManager): OpenClawPluginService {
  return {
    id: "tmux-watch",
    async start(ctx) {
      await manager.start(ctx);
    },
    async stop() {
      await manager.stop();
    },
  };
}
