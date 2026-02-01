import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createTmuxWatchManager } from "./src/manager.js";
import { createTmuxWatchService } from "./src/service.js";
import { createTmuxWatchTool } from "./src/tmux-watch-tool.js";
import { registerTmuxWatchCli } from "./src/cli.js";

const plugin = {
  id: "tmux-watch",
  name: "tmux-watch",
  description: "Watch tmux panes and notify the agent when output stays stable.",
  register(api: OpenClawPluginApi) {
    const manager = createTmuxWatchManager(api);
    api.registerTool(createTmuxWatchTool(manager));
    api.registerService(createTmuxWatchService(manager));
    api.registerCli(
      ({ program }) => {
        registerTmuxWatchCli({ program, api, logger: api.logger });
      },
      { commands: ["tmux-watch"] },
    );
  },
};

export default plugin;
