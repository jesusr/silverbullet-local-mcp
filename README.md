# silverbullet-local-mcp

A small [Model Context Protocol](https://modelcontextprotocol.io) server (stdio) that gives MCP clients such as Codex, Opencode or Claude (desktop or code) access to a [SilverBullet](https://silverbullet.md) space through its HTTP file API (`/.fs`).

It runs locally next to your MCP client and talks to your existing SilverBullet instance over HTTP: nothing to deploy on the server side. It is **read-only by default**; write tools are only registered when you opt in.

## Tools

| Tool | What it does |
| --- | --- |
| `list_pages` | List pages, optionally filtered by `prefix` (e.g. `projects`) |
| `read_page` | Raw markdown of a page (e.g. `projects/website/roadmap`) |
| `page_outline` | Frontmatter, headings, tags and links, without the body |
| `search` | Case- and accent-insensitive full-text search, with snippets |
| `recent_pages` | Most recently modified pages |
| `list_tasks` | `- [ ]` / `- [x]` / `[TODO]` tasks across the whole space |
| `list_tags` / `pages_by_tag` | Inline `#tags` and frontmatter tags |
| `backlinks` | Pages linking to a given page (`[[wiki]]` or relative links) |
| `write_page` / `append_to_page` | Only when `SB_ALLOW_WRITE=true` |

System pages (`Library/`, `Repositories/`, `SETTINGS`, `CONFIG`) are hidden by default; pass `include_system: true` to include them.

`${...}` expressions and `query[[...]]` blocks are returned unevaluated: SilverBullet evaluates them in the browser.

## Configuration (environment variables)

| Variable | Default | |
| --- | --- | --- |
| `SB_URL` | — (required) | Base URL of your SilverBullet space, e.g. `http://localhost:3000` |
| `SB_TOKEN` | — | Sent as `Authorization: Bearer`; must match `SB_AUTH_TOKEN` on the SilverBullet server |
| `SB_ALLOW_WRITE` | `false` | Enables the write tools |
| `SB_EXCLUDE` | `Library/,Repositories/,SETTINGS,CONFIG` | Comma-separated prefixes treated as system pages |

If your SilverBullet instance has authentication enabled, `SB_TOKEN` is required; without it the server reports that authentication is needed.

## Install as a Claude plugin

The repository is also a Claude plugin (`.claude-plugin/plugin.json`, `.mcp.json` and a skill that teaches Claude how to use the tools). When you enable it, Claude asks for:

- **SilverBullet URL** (required)
- **SilverBullet token** (optional, stored as a secret)
- **Allow writing** (off by default)

In Claude Code:

```sh
claude plugin marketplace add jesusr/secondbrain-mcp
claude plugin install silverbullet-local@silverbullet-local-mcp
```

The plugin runs the server locally with `npx`, so it works in Claude Code and in Claude Desktop on your computer, not in claude.ai on the web.

## Use as a standalone MCP server

Requires Node.js 20 or later.

Claude Code:

```sh
claude mcp add silverbullet -s user -e SB_URL=http://localhost:3000 -e SB_TOKEN=xxx -- npx -y silverbullet-local-mcp
```

Add `-e SB_ALLOW_WRITE=true` to enable writing.

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "silverbullet": {
      "command": "npx",
      "args": ["-y", "silverbullet-local-mcp"],
      "env": {
        "SB_URL": "http://localhost:3000",
        "SB_TOKEN": "xxx"
      }
    }
  }
}
```

The token lives in plain text in your client configuration: treat that file as a secret.

From source:

```sh
npm install
npm run build
node dist/index.js   # with SB_URL (and SB_TOKEN) set
```

## Privacy Policy

This server runs entirely on your computer and collects nothing.

- **Data collection**: none. The server has no telemetry, analytics or crash reporting.
- **Usage and storage**: it reads and, only if you enable writing, modifies pages in the SilverBullet space you configure, by calling that space's HTTP API. Page content passes through the server to your MCP client (for example Claude) when a tool is called; the server itself stores nothing on disk.
- **Third-party sharing**: the server only talks to the SilverBullet URL you configure. It sends no data to the author or any other third party. What your MCP client does with the content it receives is governed by that client's own privacy policy (for Claude, Anthropic's).
- **Data retention**: none. Nothing is kept after a request completes. Your token is stored by your MCP client (as a secret when installed as a Claude plugin), not by this server.
- **Contact**: open an issue at https://github.com/jesusr/secondbrain-mcp/issues.

## License

MIT
