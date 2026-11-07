// Lightweight extraction of SilverBullet markdown structure (frontmatter, tags, links, tasks).

export interface Task {
  page: string;
  line: number;
  state: string; // " ", "x", or a custom state like "TODO"
  done: boolean;
  text: string;
}

/** Normalizes text for accent- and case-insensitive matching. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { frontmatter: m[1], body: content.slice(m[0].length) } : { frontmatter: "", body: content };
}

/** Replaces fenced code blocks and inline code with blanks, preserving line numbers. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length));
}

function frontmatterTags(frontmatter: string): string[] {
  const inline = frontmatter.match(/^tags:\s*(.+)$/m);
  if (inline && inline[1].trim()) {
    return inline[1]
      .replace(/^\[|\]$/g, "")
      .split(/[,\s]+/)
      .map((t) => t.replace(/^["'#]+|["']+$/g, ""))
      .filter(Boolean);
  }
  const block = frontmatter.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*-\s*/, "").replace(/^["'#]+|["']+$/g, "").trim())
      .filter(Boolean);
  }
  return [];
}

export function extractTags(content: string): string[] {
  const { frontmatter, body } = splitFrontmatter(content);
  const tags = new Set(frontmatterTags(frontmatter));
  for (const m of stripCode(body).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\/-]*)/gu)) {
    // Skip CSS hex colors like #1a1a1a that aren't inside code blocks
    if (/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(m[1]) && /\d/.test(m[1])) continue;
    tags.add(m[1]);
  }
  return [...tags];
}

/** Page names referenced via [[wiki links]] or relative markdown links. */
export function extractLinks(content: string): string[] {
  const text = stripCode(content);
  const links = new Set<string>();
  for (const m of text.matchAll(/\[\[([^\]|#@]+)(?:[#@][^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    links.add(m[1].trim().replace(/^\//, ""));
  }
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    links.add(decodeURIComponent(target.replace(/^\//, "").replace(/[#@].*$/, "").replace(/\.md$/, "")));
  }
  return [...links].filter(Boolean);
}

export function extractTasks(page: string, content: string): Task[] {
  const tasks: Task[] = [];
  const lines = stripCode(content).split(/\r?\n/);
  const raw = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-*+]|\d+\.)\s+\[([^\][]*)\]\s+(.*)$/);
    if (!m) return;
    const state = m[1];
    tasks.push({
      page,
      line: i + 1,
      state,
      done: state.toLowerCase() === "x" || /^(done|hecho)$/i.test(state),
      text: raw[i].replace(/^\s*(?:[-*+]|\d+\.)\s+\[[^\]]*\]\s+/, "").trim(),
    });
  });
  return tasks;
}

/** Returns up to `max` short snippets around lines containing any of the terms. */
export function snippets(content: string, terms: string[], max = 3, width = 160): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const folded = fold(line);
    const idx = terms.map((t) => folded.indexOf(t)).filter((n) => n >= 0);
    if (!idx.length) continue;
    const start = Math.max(0, Math.min(...idx) - width / 3);
    const piece = line.slice(start, start + width).trim();
    out.push((start > 0 ? "…" : "") + piece + (start + width < line.length ? "…" : ""));
    if (out.length >= max) break;
  }
  return out;
}
