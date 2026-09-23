# TouchLines Engine MCP Server

A stdio-based [Model Context Protocol](https://modelcontextprotocol.io) server that
loads a debug snapshot (produced by `TestScreen` → `POST /api/debug/snapshot`) and
exposes engine scoring functions as tools, so an LLM can ask "why did player X
choose Y?" without re-running the game.

## Running

```bash
bun src/mcp/server.ts
# or
bun run mcp
```

The server reads JSON-RPC from stdin and writes responses to stdout — wire it
into any MCP-aware client.

### Claude Code (project-scoped)

Add to `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "touchlines-engine": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/touchlines"
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "touchlines-engine": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/touchlines"
    }
  }
}
```

## Tools & engine mechanics

The full tool catalogue, snapshot format, debugging workflow, and caveats live
with the engine rules — next to the documentation for every mechanic the tools
inspect. Keeping a single source of truth there avoids the reference drifting
out of sync with the engine.

- **[`.claude/rules/game-engine/mcp-debug.md`](../../.claude/rules/game-engine/mcp-debug.md)**
  — the MCP tool reference (`summary`, `evaluate_all_passes`, `score_pass`,
  `evaluate_carry`, `score_defensive_intent`, `score_off_ball`, `evaluate_shot`,
  `gk_position_quality`, `interception_corridors`, …), when to use each, the
  snapshot format, and the known caveats.
- **[`.claude/rules/game-engine/`](../../.claude/rules/game-engine/)** — how the
  scored mechanics actually work: carrying, passing, defensive positioning,
  off-ball movement, shooting & xG, interceptions, through balls, tackling, and
  more.

Start a debugging session with `summary` to get player IDs, then reach for the
matching `evaluate_*` / `score_*` tool.
