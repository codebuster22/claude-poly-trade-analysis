---
name: setup
description: Collect and store your Falcon API key + Polygon RPC URL for the trade-analysis plugin (fallback when the install prompt was skipped, or to rotate keys).
---

# trade-analysis setup

Use this when `analyze_fills` reports a missing key, or to rotate keys.

1. Ask the user for their **Falcon API key** and **Polygon RPC URL** (whoever shared the plugin can provide these). Do not echo the values back.
2. Store them by running (substituting the values; quote them):

   `bun ${CLAUDE_PLUGIN_ROOT}/scripts/save-keys.ts "<FALCON_API_KEY>" "<POLYGON_RPC_URL>"`

   This writes `~/.config/trade-analysis/config.json` (chmod 600), which the MCP server reads when the install-time `userConfig` values aren't present.
3. Confirm success (the script prints `saved keys -> …`). Note: the running MCP server picks up the file on its next tool call; if it still reports missing keys, tell the user to restart the Claude Code session so the server reloads.
