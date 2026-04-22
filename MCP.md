# Rival MCP Server

Exposes Rival as MCP tools so any AI agent (Claude Code, Cursor, Windsurf, Codex, etc.) can push, create, and manage functions autonomously.

## Setup

### Prerequisites

```bash
rival login   # authenticate once
```

### Claude Code

```bash
claude mcp add rival -- rival mcp
```

Or manually in `~/.claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "rival": {
      "command": "rival",
      "args": ["mcp"]
    }
  }
}
```

### Cursor / Windsurf / other MCP clients

Add to your MCP config:

```json
{
  "mcpServers": {
    "rival": {
      "command": "rival",
      "args": ["mcp"]
    }
  }
}
```

### Codex (via env vars instead of config)

Set before running Codex:

```bash
export RIVAL_TOKEN=<your-token>
export RIVAL_ORG_ID=<your-org-id>
```

## Available Tools

| Tool | What it does |
|------|-------------|
| `rival_whoami` | Verify auth, show current user & org |
| `rival_list_functions` | List all functions with IDs and versions |
| `rival_get_metadata` | Get valid runtimes, categories, sectors, compute types |
| `rival_create_function` | Create a new function + scaffold files |
| `rival_push` | Push local files to a function version |
| `rival_load` | Pull latest code from Rival to disk |
| `rival_get_versions` | List versions for a function |

## Example agent prompts

```
Push my code to Rival
```
→ Agent calls `rival_list_functions`, finds the right function, then calls `rival_push` with files from `rival.json`.

```
Create a new Rival function called "price-calculator" in Python and push this code to it
```
→ Agent calls `rival_get_metadata`, then `rival_create_function`, writes code, then `rival_push`.

```
What functions do I have on Rival?
```
→ Agent calls `rival_list_functions` and summarizes.

## How it works

`rival mcp` starts a JSON-RPC server on stdio. All tools read `rival.json` from the working directory automatically, so in a project with `rival.json` you rarely need to pass explicit IDs.

Auth uses the same `~/.rival/config.json` as the CLI (set via `rival login`), or `RIVAL_TOKEN` / `RIVAL_ORG_ID` env vars.
