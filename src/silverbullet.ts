// Thin client over the SilverBullet v2 HTTP file API (/.fs) with an in-memory page cache.

export interface FileMeta {
  name: string;
  created: number;
  lastModified: number;
  contentType: string;
  size: number;
  perm: "ro" | "rw";
}

export interface Page {
  name: string; // without .md
  lastModified: number;
  content: string;
}

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  concurrency?: number;
}

export class SilverBulletClient {
  private baseUrl: string;
  private token?: string;
  private concurrency: number;
  private cache = new Map<string, Page>();

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.concurrency = opts.concurrency ?? 8;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  private fileUrl(path: string): string {
    return `${this.baseUrl}/.fs/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: this.headers((init.headers as Record<string, string>) ?? {}),
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(
        `SilverBullet redirected (${res.status}) to ${res.headers.get("location")}; authentication is probably required (set SB_TOKEN).`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`SilverBullet rejected the request (${res.status}); check SB_TOKEN.`);
    }
    return res;
  }

  async listFiles(): Promise<FileMeta[]> {
    const res = await this.request(`${this.baseUrl}/.fs`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Listing failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as FileMeta[];
  }

  async readFile(path: string): Promise<{ content: string; lastModified: number } | null> {
    const res = await this.request(this.fileUrl(path));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Reading ${path} failed: ${res.status} ${res.statusText}`);
    const lastModified = Number(res.headers.get("x-last-modified") ?? Date.now());
    return { content: await res.text(), lastModified };
  }

  async writeFile(path: string, content: string): Promise<void> {
    const res = await this.request(this.fileUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: content,
    });
    if (!res.ok) throw new Error(`Writing ${path} failed: ${res.status} ${res.statusText}`);
    this.cache.delete(path.replace(/\.md$/, ""));
  }

  async readPage(name: string): Promise<Page | null> {
    const file = await this.readFile(`${name}.md`);
    if (!file) return null;
    const page = { name, ...file };
    this.cache.set(name, page);
    return page;
  }

  /** Metadata for all markdown pages. */
  async listPages(): Promise<FileMeta[]> {
    return (await this.listFiles()).filter((f) => f.name.endsWith(".md"));
  }

  /** Loads every page's content, refetching only those whose lastModified changed. */
  async allPages(filter: (name: string) => boolean = () => true): Promise<Page[]> {
    const metas = (await this.listPages()).filter((f) => filter(f.name.slice(0, -3)));
    const stale = metas.filter((m) => this.cache.get(m.name.slice(0, -3))?.lastModified !== m.lastModified);

    let i = 0;
    const worker = async () => {
      while (i < stale.length) {
        const meta = stale[i++];
        const file = await this.readFile(meta.name);
        const name = meta.name.slice(0, -3);
        if (file) this.cache.set(name, { name, content: file.content, lastModified: meta.lastModified });
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, stale.length) }, worker));

    return metas.map((m) => this.cache.get(m.name.slice(0, -3))).filter((p): p is Page => !!p);
  }
}
