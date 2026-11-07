#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SilverBulletClient } from "./silverbullet.js";
import { extractLinks, extractTags, extractTasks, fold, snippets, splitFrontmatter } from "./markdown.js";

const BASE_URL = process.env.SB_URL?.replace(/\/+$/, "");
if (!BASE_URL) {
  console.error("SB_URL is required: set it to the base URL of your SilverBullet space, e.g. http://localhost:3000");
  process.exit(1);
}
const ALLOW_WRITE = /^(1|true|yes)$/i.test(process.env.SB_ALLOW_WRITE ?? "");
// Pages hidden unless include_system is set: SilverBullet's own library, plugins and config.
const SYSTEM_PREFIXES = (process.env.SB_EXCLUDE ?? "Library/,Repositories/,SETTINGS,CONFIG")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sb = new SilverBulletClient({ baseUrl: BASE_URL, token: process.env.SB_TOKEN });

const server = new McpServer({ name: "silverbullet-local-mcp", version: "0.1.0" });

const includeSystem = z
  .boolean()
  .default(false)
  .describe("Include SilverBullet system pages (Library/, Repositories/, SETTINGS, CONFIG)");
const prefix = z.string().optional().describe("Only pages under this path, e.g. 'projects' or 'projects/website'");

function pageFilter(opts: { prefix?: string; include_system?: boolean }) {
  const p = opts.prefix?.replace(/^\/|\/$/g, "");
  return (name: string) => {
    if (!opts.include_system && SYSTEM_PREFIXES.some((s) => name.startsWith(s))) return false;
    if (p && name !== p && !name.startsWith(p + "/")) return false;
    return true;
  };
}

const iso = (ms: number) => new Date(ms).toISOString();
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const normTag = (t: string) => fold(t.replace(/^#/, ""));

server.registerTool(
  "list_pages",
  {
    title: "List pages",
    description: "List pages in the second brain (SilverBullet space) with last-modified date and size.",
    inputSchema: { prefix, include_system: includeSystem },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const keep = pageFilter(args);
    const pages = (await sb.listPages())
      .map((f) => ({ name: f.name.slice(0, -3), lastModified: iso(f.lastModified), size: f.size }))
      .filter((p) => keep(p.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    return json(pages);
  },
);

server.registerTool(
  "read_page",
  {
    title: "Read page",
    description:
      "Read the raw markdown of a page. Name is the page path without .md, e.g. 'projects/website/roadmap'. " +
      "Note: ${...} Lua expressions and query blocks are returned unevaluated.",
    inputSchema: { name: z.string().describe("Page name, without .md") },
    annotations: { readOnlyHint: true },
  },
  async ({ name }) => {
    const clean = name.replace(/^\//, "").replace(/\.md$/, "");
    const page = await sb.readPage(clean);
    if (!page) return { ...text(`Page not found: ${clean}`), isError: true };
    return text(`# ${page.name}\n_Last modified: ${iso(page.lastModified)}_\n\n${page.content}`);
  },
);

server.registerTool(
  "search",
  {
    title: "Full-text search",
    description:
      "Search page names and contents (case- and accent-insensitive). All terms must match. " +
      "Returns matching pages ranked by relevance with snippets.",
    inputSchema: {
      query: z.string().min(1),
      prefix,
      limit: z.number().int().min(1).max(100).default(20),
      include_system: includeSystem,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, limit, ...opts }) => {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    const pages = await sb.allPages(pageFilter(opts));
    const results = pages
      .map((p) => {
        const name = fold(p.name);
        const body = fold(p.content);
        if (!terms.every((t) => name.includes(t) || body.includes(t))) return null;
        let score = 0;
        for (const t of terms) {
          if (name.includes(t)) score += 10;
          score += Math.min(body.split(t).length - 1, 20);
        }
        return { page: p.name, score, lastModified: iso(p.lastModified), snippets: snippets(p.content, terms) };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return results.length ? json(results) : text(`No results for "${query}".`);
  },
);

server.registerTool(
  "recent_pages",
  {
    title: "Recently modified pages",
    description: "List the most recently modified pages.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(15), prefix, include_system: includeSystem },
    annotations: { readOnlyHint: true },
  },
  async ({ limit, ...opts }) => {
    const keep = pageFilter(opts);
    const pages = (await sb.listPages())
      .filter((f) => keep(f.name.slice(0, -3)))
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, limit)
      .map((f) => ({ name: f.name.slice(0, -3), lastModified: iso(f.lastModified) }));
    return json(pages);
  },
);

server.registerTool(
  "list_tasks",
  {
    title: "List tasks",
    description: "List markdown tasks (- [ ] / - [x] / custom states) across the space.",
    inputSchema: {
      status: z.enum(["open", "done", "all"]).default("open"),
      prefix,
      contains: z.string().optional().describe("Only tasks whose text contains this (accent-insensitive)"),
      include_system: includeSystem,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status, contains, ...opts }) => {
    const needle = contains ? fold(contains) : undefined;
    const pages = await sb.allPages(pageFilter(opts));
    const tasks = pages
      .sort((a, b) => b.lastModified - a.lastModified)
      .flatMap((p) => extractTasks(p.name, p.content))
      .filter((t) => status === "all" || (status === "done") === t.done)
      .filter((t) => !needle || fold(t.text).includes(needle));
    return tasks.length ? json(tasks) : text("No matching tasks.");
  },
);

server.registerTool(
  "list_tags",
  {
    title: "List tags",
    description: "List all #tags (inline and frontmatter) with the number of pages using each.",
    inputSchema: { prefix, include_system: includeSystem },
    annotations: { readOnlyHint: true },
  },
  async (opts) => {
    const counts = new Map<string, number>();
    for (const p of await sb.allPages(pageFilter(opts))) {
      for (const t of extractTags(p.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return json(Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])));
  },
);

server.registerTool(
  "pages_by_tag",
  {
    title: "Pages by tag",
    description: "Find pages tagged with a given tag (with or without #). Matches sub-tags too, e.g. 'project' matches 'project/website'.",
    inputSchema: { tag: z.string().min(1), include_system: includeSystem },
    annotations: { readOnlyHint: true },
  },
  async ({ tag, include_system }) => {
    const wanted = normTag(tag);
    const pages = (await sb.allPages(pageFilter({ include_system })))
      .filter((p) => extractTags(p.content).some((t) => normTag(t) === wanted || normTag(t).startsWith(wanted + "/")))
      .map((p) => ({ name: p.name, lastModified: iso(p.lastModified) }));
    return pages.length ? json(pages) : text(`No pages tagged #${tag}.`);
  },
);

server.registerTool(
  "backlinks",
  {
    title: "Backlinks",
    description: "Find pages that link to the given page via [[wiki links]] or relative markdown links.",
    inputSchema: { name: z.string().min(1).describe("Target page name"), include_system: includeSystem },
    annotations: { readOnlyHint: true },
  },
  async ({ name, include_system }) => {
    const target = fold(name.replace(/^\//, "").replace(/\.md$/, ""));
    const pages = (await sb.allPages(pageFilter({ include_system })))
      .filter((p) => extractLinks(p.content).some((l) => fold(l) === target))
      .map((p) => p.name);
    return pages.length ? json(pages) : text(`No pages link to ${name}.`);
  },
);

server.registerTool(
  "page_outline",
  {
    title: "Page outline",
    description: "Get a page's frontmatter, headings, tags and outgoing links without the full body.",
    inputSchema: { name: z.string().min(1) },
    annotations: { readOnlyHint: true },
  },
  async ({ name }) => {
    const clean = name.replace(/^\//, "").replace(/\.md$/, "");
    const page = await sb.readPage(clean);
    if (!page) return { ...text(`Page not found: ${clean}`), isError: true };
    const { frontmatter, body } = splitFrontmatter(page.content);
    return json({
      name: page.name,
      lastModified: iso(page.lastModified),
      frontmatter: frontmatter || undefined,
      headings: body.split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l)),
      tags: extractTags(page.content),
      links: extractLinks(page.content),
      tasks: extractTasks(page.name, page.content).length,
    });
  },
);

if (ALLOW_WRITE) {
  server.registerTool(
    "write_page",
    {
      title: "Write page",
      description: "Create or overwrite a page with the given markdown content.",
      inputSchema: { name: z.string().min(1), content: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ name, content }) => {
      const clean = name.replace(/^\//, "").replace(/\.md$/, "");
      await sb.writeFile(`${clean}.md`, content);
      return text(`Wrote ${clean}`);
    },
  );

  server.registerTool(
    "append_to_page",
    {
      title: "Append to page",
      description: "Append markdown to the end of a page (creates it if missing). Handy for Inbox or Journal notes.",
      inputSchema: { name: z.string().min(1), content: z.string().min(1) },
      annotations: { destructiveHint: false },
    },
    async ({ name, content }) => {
      const clean = name.replace(/^\//, "").replace(/\.md$/, "");
      const existing = (await sb.readPage(clean))?.content ?? "";
      const sep = existing && !existing.endsWith("\n") ? "\n" : "";
      await sb.writeFile(`${clean}.md`, existing + sep + content + "\n");
      return text(`Appended to ${clean}`);
    },
  );
}

await server.connect(new StdioServerTransport());
