/**
 * Live web research module — open-web grounding for the support agent.
 *
 * When the local evidence (curated corpus + FAISS over the 2017-era twcs
 * history) cannot answer a question, the agent searches the OPEN WEB —
 * Google-style results, Reddit threads, Twitter/X posts and comments, Apple
 * forum discussions and official support pages — and synthesizes a public
 * reply strictly grounded in what those sources say, with the source links
 * cited inline.
 *
 * Uses z-ai-web-dev-sdk functions (backend only):
 *   - `web_search`  → multi-query live search (general / reddit / twitter /
 *     official), merged, deduped and classified by host
 *   - `page_reader` → best-effort deep read of the single most relevant
 *     community source, so replies can quote actual thread content
 *
 * The z-ai instance is injected by index.ts (single shared instance).
 * All network calls are time-boxed and failure-tolerant: research NEVER
 * breaks a chat turn — on any error the caller falls back to the local
 * evidence / deterministic macro path.
 */

export type WebSourceKind =
  | "reddit"
  | "twitter"
  | "forum"
  | "official"
  | "web";

export interface WebSource {
  title: string;
  url: string;
  host: string;
  kind: WebSourceKind;
  snippet: string;
  date?: string;
  /** which search query surfaced this result */
  query: string;
  /** page_reader extract (truncated) — present only for the deep-read source */
  extracted?: string;
}

export interface WebResearchOutcome {
  /** true when enough usable sources were found to ground a reply */
  used: boolean;
  queries: string[];
  sources: WebSource[];
  search_ms: number;
  read_ms: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const SEARCH_TIMEOUT_MS = 14_000;
const READ_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 200;
/** Bump when the merge/filter logic changes — stale cached outcomes from
 *  an older logic version must not leak through hot reloads (the cache Map
 *  itself lives on globalThis and survives module re-evaluation). */
const CACHE_VERSION = 3;
const MAX_SOURCES = 6;
const MAX_PER_KIND = 2;
const EXTRACT_CHARS = 1200;
const MIN_SOURCES_FOR_REPLY = 2;

/* ------------------------------------------------------------------ */
/* Host classification                                                 */
/* ------------------------------------------------------------------ */

export function classifyHost(host: string): WebSourceKind {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h.endsWith("reddit.com") || h.endsWith("redd.it") || h.startsWith("np.reddit") || h.startsWith("old.reddit"))
    return "reddit";
  if (h.endsWith("twitter.com") || h.endsWith("x.com") || h.startsWith("twitter."))
    return "twitter";
  if (
    h.endsWith("discussions.apple.com") ||
    h.endsWith("developer.apple.com") ||
    h.endsWith("communities.macrumors.com") ||
    h.endsWith("superuser.com") ||
    h.endsWith("apple.stackexchange.com") ||
    h.endsWith("stackoverflow.com") ||
    h.includes("forum")
  )
    return "forum";
  if (h.endsWith("apple.com") || h.endsWith("appleid.apple.com") || h.endsWith("iforgot.apple.com"))
    return "official";
  return "web";
}

const KIND_WEIGHT: Record<WebSourceKind, number> = {
  official: 3,
  reddit: 2.5,
  forum: 2,
  twitter: 1.5,
  web: 1,
};

export const KIND_LABEL: Record<WebSourceKind, string> = {
  reddit: "Reddit",
  twitter: "Twitter/X",
  forum: "Forum",
  official: "Official",
  web: "Web",
};

/* ------------------------------------------------------------------ */
/* Query construction                                                  */
/* ------------------------------------------------------------------ */

/** Strip mentions, links and filler words so the query reads like a search. */
export function sanitizeQuery(message: string): string {
  return message
    .replace(/@\w+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(
      /\b(?:please|pls|plz|kindly|help(?:\s+me)?|thanks|thank\s+you|thx|ty|hi|hello|hey|guys|team|folks|asap|urgent)\b/gi,
      " ",
    )
    .replace(/[^a-zA-Z0-9\s'.,#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function buildResearchQueries(
  message: string,
  intentLabel?: string,
): string[] {
  const base = sanitizeQuery(message);
  if (!base) return [];
  const queries = new Set<string>();
  queries.add(base);
  queries.add(`${base} reddit`);
  queries.add(`${base} twitter`);
  // NOTE: the search backend does NOT support the `site:` operator (it
  // returns junk), so official-page bias is done with plain keywords.
  queries.add(`apple support ${base}`);
  return [...queries].slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Result processing                                                   */
/* ------------------------------------------------------------------ */

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.keys()].filter(
      (k) => !k.toLowerCase().startsWith("utm_"),
    );
    for (const k of params) u.searchParams.delete(k);
    u.hash = "";
    u.host = u.host.replace(/^www\./, "");
    if (u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

interface RawSearchItem {
  url?: string;
  name?: string;
  snippet?: string;
  host_name?: string;
  rank?: number;
  date?: string;
}

/** Merge, dedupe, classify and rank search hits into a diverse source list.
 *  Sources whose title/snippet share no significant token with the original
 *  question are dropped — search backends occasionally return off-topic
 *  junk (dictionary sites, unrelated services) that must never ground a
 *  reply. Official Apple hosts always pass. */
function mergeSearchHits(
  hits: Array<{ query: string; items: RawSearchItem[] }>,
  baseTokens: Set<string>,
): WebSource[] {
  const byUrl = new Map<string, WebSource>();
  for (const { query, items } of hits) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const url = typeof item?.url === "string" ? item.url.trim() : "";
      const title = typeof item?.name === "string" ? item.name.trim() : "";
      const snippet =
        typeof item?.snippet === "string" ? item.snippet.trim() : "";
      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (!title && !snippet) continue;
      const key = normalizeUrl(url);
      const host =
        typeof item?.host_name === "string" && item.host_name
          ? item.host_name
          : (() => {
              try {
                return new URL(url).host;
              } catch {
                return "web";
              }
            })();
      const existing = byUrl.get(key);
      if (existing) {
        // keep the richer snippet if a second query surfaced the same page
        if (snippet.length > existing.snippet.length) existing.snippet = snippet;
        continue;
      }
      byUrl.set(key, {
        title: title || host,
        url,
        host,
        kind: classifyHost(host),
        snippet,
        date: typeof item?.date === "string" ? item.date : undefined,
        query,
      });
    }
  }

  const all = [...byUrl.values()].filter((s) =>
    topicallyRelevant(s, baseTokens),
  );
  // Rank: kind authority first (official > reddit > forum > twitter > web),
  // then original search rank.
  all.sort((a, b) => {
    const w = KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind];
    if (w !== 0) return w;
    return 0;
  });

  // Diversity: at most MAX_PER_KIND per kind, then overall cap.
  const perKind = new Map<WebSourceKind, number>();
  const picked: WebSource[] = [];
  for (const s of all) {
    const n = perKind.get(s.kind) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    perKind.set(s.kind, n + 1);
    picked.push(s);
    if (picked.length >= MAX_SOURCES) break;
  }
  return picked;
}

/** Token-overlap relevance probe (see mergeSearchHits).
 *  Community + official sources pass on ONE significant shared token (high
 *  recall — thin titles like "Can't remember my iCloud password" are
 *  relevant); low-trust kinds (web, twitter) must share TWO, which drops
 *  tangential hits like a generic "iPhone" mention on an unrelated page. */
function topicallyRelevant(source: WebSource, baseTokens: Set<string>): boolean {
  if (source.kind === "official") return true; // apple.com hosts are topical
  if (baseTokens.size === 0) return true;
  const minMatches =
    source.kind === "reddit" || source.kind === "forum" ? 1 : 2;
  const text = `${source.title} ${source.snippet} ${source.host}`.toLowerCase();
  let matches = 0;
  for (const token of baseTokens) {
    if (token.length >= 4 && text.includes(token)) {
      matches++;
      if (matches >= minMatches) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Cache (survives hot reloads via globalThis)                         */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  ts: number;
  outcome: WebResearchOutcome;
}

function researchCache(): Map<string, CacheEntry> {
  const g = globalThis as Record<string, unknown>;
  const key = `__appleSupportWebResearchCache_v${CACHE_VERSION}`;
  const existing = g[key] as Map<string, CacheEntry> | undefined;
  if (existing instanceof Map) return existing;
  const fresh = new Map<string, CacheEntry>();
  g[key] = fresh;
  return fresh;
}

function cacheGet(key: string): CacheEntry | null {
  const hit = researchCache().get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    researchCache().delete(key);
    return null;
  }
  return hit;
}

function cacheSet(key: string, outcome: WebResearchOutcome): void {
  const cache = researchCache();
  if (cache.size >= CACHE_MAX) {
    // drop the oldest entries (insertion order)
    const drop = cache.size - CACHE_MAX + 1;
    let i = 0;
    for (const k of cache.keys()) {
      cache.delete(k);
      if (++i >= drop) break;
    }
  }
  cache.set(key, { ts: Date.now(), outcome });
}

/* ------------------------------------------------------------------ */
/* Deep read (page_reader, best-effort)                                */
/* ------------------------------------------------------------------ */

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function deepReadBest(
  zai: any,
  sources: WebSource[],
): Promise<{ sources: WebSource[]; readMs: number }> {
  const t0 = Date.now();
  if (sources.length === 0) return { sources, readMs: 0 };
  // Prefer a community/official source with a thin snippet — the deep read
  // exists to pull actual thread/page content the search blurb lacks.
  const target =
    sources.find(
      (s) =>
        (s.kind === "reddit" || s.kind === "forum" || s.kind === "twitter") &&
        s.snippet.length < 160,
    ) ?? sources[0];
  try {
    const result = await Promise.race([
      zai.functions.invoke("page_reader", { url: target.url }),
      new Promise((_, rej) =>
        setTimeout(
          () => rej(new Error(`page_reader timed out after ${READ_TIMEOUT_MS}ms`)),
          READ_TIMEOUT_MS,
        ),
      ),
    ]);
    const data = result?.data ?? result;
    const html = typeof data?.html === "string" ? data.html : "";
    const text = typeof data?.text === "string" ? data.text : "";
    if (typeof data?.title === "string" && data.title && !target.title) {
      target.title = data.title.slice(0, 200);
    }
    const extract = htmlToText(text || html).slice(0, EXTRACT_CHARS);
    // Anti-bot interstitials (Reddit's "blocked by network security", login
    // walls, captchas) are NOT page content — keep the search snippet instead.
    const looksLikeBlock =
      /blocked by (?:network|robot|bot)|log in to your .* account|verify you are a human|are you a robot|access denied|captcha/i.test(
        extract.slice(0, 400),
      );
    if (extract.length > 80 && !looksLikeBlock) {
      target.extracted = extract;
      if (target.snippet.length < 60) target.snippet = extract.slice(0, 220);
    }
  } catch {
    /* best-effort only — search snippets remain the grounding */
  }
  return { sources, readMs: Date.now() - t0 };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Research the open web for a customer message. Runs up to 4 parallel
 * searches (general / reddit / twitter / official), merges + dedupes +
 * classifies the hits, and deep-reads the most relevant page.
 *
 * Never throws: returns an outcome with `used: false` on failure so the
 * caller can fall back to the local-evidence path.
 */
export async function researchWeb(
  zai: any,
  message: string,
  intentLabel?: string,
): Promise<WebResearchOutcome> {
  const queries = buildResearchQueries(message, intentLabel);
  if (queries.length === 0) {
    return { used: false, queries: [], sources: [], search_ms: 0, read_ms: 0 };
  }

  const cacheKey = `${intentLabel ?? ""}|${sanitizeQuery(message).toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached.outcome, sources: cached.outcome.sources };

  // significant tokens of the ORIGINAL question — used to drop off-topic hits
  const baseTokens = new Set(
    (sanitizeQuery(message).toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
      (t) => !/[.]/.test(t),
    ),
  );

  const tSearch = Date.now();
  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const items = await Promise.race([
        zai.functions.invoke("web_search", { query, num: 5 }),
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error(`web_search timed out after ${SEARCH_TIMEOUT_MS}ms`)),
            SEARCH_TIMEOUT_MS,
          ),
        ),
      ]);
      return { query, items: Array.isArray(items) ? items : [] };
    }),
  );
  const hits = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ query: string; items: RawSearchItem[] }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
  const searchMs = Date.now() - tSearch;

  let sources = mergeSearchHits(hits, baseTokens);
  let readMs = 0;
  if (sources.length > 0) {
    const deep = await deepReadBest(zai, sources);
    sources = deep.sources;
    readMs = deep.readMs;
  }

  const failed = settled.some((r) => r.status === "rejected");
  const outcome: WebResearchOutcome = {
    used: sources.length >= MIN_SOURCES_FOR_REPLY,
    queries,
    sources,
    search_ms: searchMs,
    read_ms: readMs,
    error:
      sources.length === 0 && failed
        ? "web search returned no usable results"
        : undefined,
  };
  if (outcome.used) cacheSet(cacheKey, outcome);
  return outcome;
}

/* ------------------------------------------------------------------ */
/* Prompts for the web-grounded reply                                  */
/* ------------------------------------------------------------------ */

export const WEB_SYSTEM_PROMPT = `You are the public-reply engine of a customer-support prototype ("Apple Support AI"). You write ONE public reply to a customer, grounded STRICTLY in numbered LIVE WEB SOURCES given as evidence (official Apple pages, Reddit threads, Twitter/X posts, forum discussions — fetched moments ago).

Safety rules — non-negotiable:
1. Use only facts, troubleshooting steps, settings paths and links that appear in the numbered sources. Never invent prices, dates, software versions, policies, phone numbers or links.
2. Be CONCRETE: give the actual steps or self-service link(s) from the sources that address the customer's issue. Do not collapse into "contact us" filler when the sources contain real steps.
3. Cite: include at most 2 of the source URLs inline as plain URLs (no markdown, no brackets). Prefer the official page for the main fix; add ONE community link (Reddit/forum) only when it genuinely adds a working fix people report.
4. Account-, payment- or security-specific matters: still give the public self-service steps and link from the sources, then add ONE short sentence that anything specific to their account continues in Direct Messages. Never ask for or repeat personal details in public.
5. If the sources do not clearly address the customer's issue, do not guess: say you'd like to look into it with them and ask ONE short clarifying question.
6. Style: warm, concise, professional. Vary the opening — never the same stock phrase twice in one conversation. No hashtags, no emoji, no signatures, no quotation marks around the reply.
7. Length: at most 500 characters, one short paragraph (or two sentences).
8. Grounding cue: weave in ONE light natural cue that this reflects what's publicly documented or what's working for people (e.g. "the steps Apple documents…", "a fix many users report…", "the current guidance…"). Vary the wording and placement.

Output ONLY the reply text.`;

interface ResearchPromptIntent {
  label: string;
  confidence: number;
}

interface ResearchPromptHistory {
  role: string;
  content: string;
}

/** User prompt for the web-grounded reply (escalation + auto paths). */
export function buildWebResearchUserPrompt(
  message: string,
  intent: ResearchPromptIntent,
  sources: WebSource[],
  queries: string[],
  history: ResearchPromptHistory[] = [],
  escalated: boolean = false,
): string {
  const lines: string[] = [];
  lines.push(`Customer message: "${message}"`);
  lines.push("");
  lines.push(
    `Predicted issue: ${intent.label} (confidence ${intent.confidence.toFixed(2)})`,
  );
  lines.push(
    escalated
      ? "Context: the deterministic policy routed this to a human agent — your reply is the public answer sent meanwhile, so it must stand on its own."
      : "Context: this reply supplements historical-case grounding with live web references.",
  );

  if (history.length > 0) {
    lines.push("");
    lines.push(`Conversation so far (oldest first, ${history.length} messages):`);
    for (const m of history) {
      const who = m.role === "user" ? "Customer" : "Agent";
      lines.push(`${who}: "${m.content.slice(0, 240)}"`);
    }
    const openers = history
      .filter((m) => m.role === "agent")
      .map((m) => m.content.trim().split(/[\s,]+/).slice(0, 6).join(" "))
      .slice(-3);
    if (openers.length > 0) {
      lines.push(
        `Openers already used in this conversation: ${openers
          .map((o) => `"${o}…"`)
          .join(", ")} — start this reply DIFFERENTLY.`,
      );
    }
  }

  lines.push("");
  lines.push(`Research queries used: ${queries.map((q) => `"${q}"`).join(", ")}`);
  lines.push("Live web sources, most relevant first:");
  sources.forEach((s, i) => {
    lines.push(
      `[${i + 1}] ${KIND_LABEL[s.kind]} · ${s.host}${s.date ? ` · ${s.date}` : ""}`,
    );
    lines.push(`    Title: ${s.title.slice(0, 200)}`);
    lines.push(`    Link: ${s.url}`);
    const body = s.extracted ?? s.snippet;
    if (body) lines.push(`    Content: ${body.slice(0, 1200)}`);
  });
  lines.push("");
  lines.push("Draft the reply now, following every safety rule.");
  return lines.join("\n");
}
