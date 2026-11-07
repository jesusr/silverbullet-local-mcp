# secondbrain-mcp

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

## Usage

Requires Node.js 20 or later.

```sh
npm install
npm run build
```

Claude Code:

```sh
claude mcp add secondbrain -s user -e SB_URL=http://localhost:3000 -e SB_TOKEN=xxx -- node /path/to/secondbrain-mcp/dist/index.js
```

Add `-e SB_ALLOW_WRITE=true` to enable writing.

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "secondbrain": {
      "command": "node",
      "args": ["/path/to/secondbrain-mcp/dist/index.js"],
      "env": {
        "SB_URL": "https://domain.dd/",
        "SB_TOKEN": "xxx"
      }
    }
  }
}
```

The token lives in plain text in your client configuration: treat that file as a secret.

## License

MIT
