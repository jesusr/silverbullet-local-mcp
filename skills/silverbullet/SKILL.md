---
name: silverbullet
description: How to find, read and update notes in the user's SilverBullet space with the silverbullet-local MCP tools. Use when the user mentions SilverBullet, their notes, wiki, knowledge base or "second brain", or asks to look something up in, or save something to, their notes.
---

# Working with a SilverBullet space

The `silverbullet` MCP server exposes the user's SilverBullet space. Page names are paths without the `.md` extension, e.g. `projects/website/roadmap`.

## Finding things

- Unknown location: start with `search` (case- and accent-insensitive, returns snippets), then open the best hits.
- Known area: `list_pages` with a `prefix` (e.g. `projects`) instead of listing the whole space.
- "What was I working on": `recent_pages`.
- Topics and connections: `list_tags` / `pages_by_tag` for tags (sub-tags match too), `backlinks` for pages that link to a given page.
- Open work: `list_tasks` for `- [ ]` / `- [x]` / `[TODO]` items across the space.

## Reading

- For long pages, call `page_outline` first (frontmatter, headings, tags, links) and only then `read_page` if the body is needed.
- `${...}` expressions and `query[[...]]` blocks come back unevaluated: SilverBullet evaluates them in the browser. Don't present them as results; if the user needs the data, find the underlying pages (via tags or search) and read those.
- Links to pages that don't exist yet are normal in SilverBullet (placeholders for future pages), not broken links.
- System pages (`Library/`, `Repositories/`, `SETTINGS`, `CONFIG`) are hidden unless you pass `include_system: true`; only do so when the user asks about configuration or plugins.

## Writing

- `write_page` and `append_to_page` only exist when the user enabled writing.
- Write only when the user asks for it. Prefer `append_to_page` for adding entries to an existing page; `write_page` replaces the whole page, so read it first and keep what the user didn't ask to change.
- Keep SilverBullet conventions: markdown, `[[wiki links]]`, `#tags`, frontmatter at the top of the page.
- After writing, tell the user which page changed.
