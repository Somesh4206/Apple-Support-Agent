"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Download,
  FileText,
  ListTree,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SCROLLABLE_LIST_CLASS } from "@/components/phase1/charts";
import { SectionHeading } from "@/components/phase1/section-heading";
import {
  formatBytes,
  type Phase1Doc,
  type Phase1DocsResponse,
} from "@/lib/phase1";
import { cn } from "@/lib/utils";

type DocsLoadState = "loading" | "ready" | "not_available" | "error";

/* ------------------------------------------------------------------ */
/* Markdown rendering (theme-aware, zinc + emerald + amber)            */
/* ------------------------------------------------------------------ */

/**
 * Component overrides for the repo markdown docs — mirrors the dashboard's
 * typographic scale: emerald accents for h2 borders and links, amber
 * blockquotes (the historical-data disclaimer styling), zinc body text and
 * both light and dark variants everywhere.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-3 border-b border-zinc-200 pb-2 text-xl font-bold tracking-tight text-zinc-900 first:mt-0 dark:border-zinc-800 dark:text-zinc-50">
      {children}
    </h1>
  ),
  h2: ({ children, node }) => (
    <h2
      id={node?.position ? headingIdForLine(node.position.start.line) : undefined}
      className="mt-6 mb-2 border-l-4 border-emerald-500 pl-3 text-base font-semibold text-zinc-900 first:mt-0 scroll-mt-2 dark:border-emerald-400 dark:text-zinc-50"
    >
      {children}
    </h2>
  ),
  h3: ({ children, node }) => (
    <h3
      id={node?.position ? headingIdForLine(node.position.start.line) : undefined}
      className="mt-4 mb-1.5 text-sm font-semibold text-zinc-900 first:mt-0 scroll-mt-2 dark:text-zinc-100"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-medium text-zinc-800 first:mt-0 dark:text-zinc-200">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-2.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-700 marker:text-zinc-400 dark:text-zinc-300 dark:marker:text-zinc-500">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-zinc-700 marker:text-zinc-400 dark:text-zinc-300 dark:marker:text-zinc-500">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="break-words pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-amber-400 bg-amber-50/80 px-4 py-2 text-sm leading-relaxed text-amber-900 dark:border-amber-600/80 dark:bg-amber-950/40 dark:text-amber-200/90 [&>p]:my-1.5">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded-sm bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 [&>code]:bg-transparent [&>code]:px-0 [&>code]:py-0 [&>code]:text-inherit">
      {children}
    </pre>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 transition-colors hover:text-emerald-600 hover:decoration-emerald-500 dark:text-emerald-400 dark:decoration-emerald-400/40 dark:hover:text-emerald-300"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-5 border-zinc-200 dark:border-zinc-800" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </strong>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs sm:text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-zinc-50 dark:bg-zinc-900/60">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-200 px-2.5 py-1.5 font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-200 px-2.5 py-1.5 align-top text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
      {children}
    </td>
  ),
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Minimum length for a find-in-document query (avoids single-letter noise). */
const FIND_MIN_LENGTH = 2;
const FIND_DEBOUNCE_MS = 200;
/** Minimum number of headings before the table-of-contents nav renders. */
const TOC_MIN_HEADINGS = 3;

/** One table-of-contents entry, extracted from the raw markdown source. */
interface TocEntry {
  /** Heading level (2 for ##, 3 for ###). */
  level: 2 | 3;
  /** Visible heading text (markdown syntax stripped). */
  text: string;
  /** DOM id of the rendered heading — line-number based so the TOC and the
   *  rendered tree can never drift apart. */
  id: string;
}

/** heading id derived from a source line number (used by both TOC + render). */
function headingIdForLine(line: number): string {
  return `doc-h-l${line}`;
}

/**
 * Extracts ## / ### headings from the raw markdown source, skipping fenced
 * code blocks. Line numbers come straight from the source, and the rendered
 * h2/h3 overrides derive the same ids from the hast node position — the two
 * can never desync.
 */
function extractToc(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (match) {
      entries.push({
        level: match[1].length as 2 | 3,
        text: match[2].replace(/[*`\[\]]/g, "").trim(),
        id: headingIdForLine(index + 1),
      });
    }
  }
  return entries;
}

/*
 * Find-in-document state machine. Highlights are applied imperatively on
 * the rendered markdown DOM (ReactMarkdown has no text-node override):
 *   1. clear previous marks (unwrap <mark> → text nodes, then normalize)
 *   2. walk every text node, wrap case-insensitive matches in
 *      <mark class="find-doc-mark">, count them
 *   3. the active match gets data-active="true" + scrollIntoView
 * The hook re-runs whenever the query or the doc changes (tab switches
 * remount the panel content), so stale marks can never survive.
 */

/**
 * Scroll-spy for the table of contents: reports the id of the last heading
 * whose top edge has scrolled past ACTIVE_HEADING_OFFSET_PX (the sticky page
 * header height plus a little slack). At the very bottom of the page the last
 * heading wins so the tail sections highlight too. Updates are coalesced into
 * one requestAnimationFrame per scroll burst.
 */
const ACTIVE_HEADING_OFFSET_PX = 140;

function useActiveHeading(
  toc: TocEntry[],
  docKey: string,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (toc.length === 0) {
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      let current: string | null = null;
      for (const entry of toc) {
        const el = document.getElementById(entry.id);
        if (!el) {
          continue;
        }
        if (el.getBoundingClientRect().top <= ACTIVE_HEADING_OFFSET_PX) {
          current = entry.id;
        } else {
          break;
        }
      }
      if (
        current === null &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 60
      ) {
        current = toc[toc.length - 1]?.id ?? null;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) {
        raf = window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [toc, docKey]);

  return activeId;
}

interface FindInDocState {
  matchCount: number;
  activeIndex: number;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
}

function clearFindMarks(container: HTMLElement): void {
  const marks = container.querySelectorAll<HTMLElement>("mark.find-doc-mark");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(
      document.createTextNode(mark.textContent ?? ""),
      mark,
    );
    parent.normalize();
  });
}

function applyFindMarks(container: HTMLElement, query: string): number {
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  let count = 0;
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    const lower = text.toLowerCase();
    let start = lower.indexOf(needle);
    if (start === -1) {
      continue;
    }
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (start !== -1) {
      if (start > cursor) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursor, start)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = "find-doc-mark";
      mark.textContent = text.slice(start, start + needle.length);
      fragment.appendChild(mark);
      count += 1;
      cursor = start + needle.length;
      start = lower.indexOf(needle, cursor);
    }
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
  return count;
}

function useFindInDoc(
  containerRef: React.RefObject<HTMLElement | null>,
  query: string,
  docKey: string,
): FindInDocState {
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);

  // (Re)apply the highlights whenever the query or the document changes.
  // All state updates happen inside the requestAnimationFrame callback (an
  // external-system tick), never synchronously in the effect body.
  useEffect(() => {
    const container = containerRef.current;
    const trimmed = query.trim();
    const handle = window.requestAnimationFrame(() => {
      if (!container) {
        clearState();
        return;
      }
      clearFindMarks(container);
      if (trimmed.length < FIND_MIN_LENGTH) {
        clearState();
        return;
      }
      const total = applyFindMarks(container, trimmed);
      setMatchCount(total);
      activeRef.current = 0;
      setActiveIndex(0);
      paintActiveMark(container, 0, total > 0);
    });
    return () => {
      window.cancelAnimationFrame(handle);
      if (container) {
        clearFindMarks(container);
      }
    };
    function clearState() {
      setMatchCount(0);
      setActiveIndex(0);
      activeRef.current = 0;
    }
  }, [containerRef, query, docKey]);

  const goTo = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container || matchCount === 0) {
        return;
      }
      const bounded = ((index % matchCount) + matchCount) % matchCount;
      activeRef.current = bounded;
      setActiveIndex(bounded);
      paintActiveMark(container, bounded, true);
    },
    [containerRef, matchCount],
  );

  const next = useCallback(
    () => goTo(activeRef.current + 1),
    [goTo],
  );
  const prev = useCallback(
    () => goTo(activeRef.current - 1),
    [goTo],
  );

  return { matchCount, activeIndex, goTo, next, prev };
}

function paintActiveMark(
  container: HTMLElement,
  index: number,
  scrollIntoView: boolean,
): void {
  const marks = container.querySelectorAll<HTMLElement>("mark.find-doc-mark");
  marks.forEach((mark, i) => {
    if (i === index) {
      mark.setAttribute("data-active", "true");
      if (scrollIntoView) {
        mark.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }
    } else {
      mark.removeAttribute("data-active");
    }
  });
}

/** Client-side download of the raw markdown via a Blob (no backend route). */
function downloadMarkdown(doc: Phase1Doc): void {
  const fileName = doc.path.split("/").pop() || `${doc.slug}.md`;
  const blob = new Blob([doc.content], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke one tick later so the download has started first.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function formatModifiedDate(doc: Phase1Doc): string {
  const modified = new Date(doc.modifiedAt);
  return Number.isNaN(modified.getTime())
    ? "—"
    : modified.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

/**
 * "Project documentation" section — renders the repository's own Phase 1
 * deliverables (report.md, README.md, decision_log.md) served by
 * GET /api/phase1/docs. Owns its loading / error / unreadable states
 * independently of the EDA summary.
 */
export function DocsViewer() {
  const [state, setState] = useState<DocsLoadState>("loading");
  const [docs, setDocs] = useState<Phase1Doc[]>([]);
  const [note, setNote] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      setState("loading");
      try {
        const response = await fetch("/api/phase1/docs", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as Phase1DocsResponse;
        if (!active) {
          return;
        }
        if (
          payload.ok &&
          payload.status === "READY" &&
          payload.docs &&
          payload.docs.length > 0
        ) {
          setDocs(payload.docs);
          setNote(payload.message ?? "");
          setState("ready");
        } else {
          setDocs([]);
          setNote(
            payload.message ??
              "The project documents could not be read from the repository.",
          );
          setState("not_available");
        }
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setDocs([]);
        setNote(
          err instanceof Error
            ? err.message
            : "Unable to reach the docs API.",
        );
        setState("error");
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  return (
    <section aria-labelledby="docs-heading" className="space-y-4">
      <SectionHeading
        id="docs-heading"
        icon={FileText}
        title="Project documentation"
        description="The repository's own Phase 1 deliverables — the technical report, README and decision log — rendered from the files on disk via /api/phase1/docs."
      />

      {state === "loading" ? <DocsSkeleton /> : null}

      {state === "error" ? (
        <Alert
          variant="destructive"
          className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
        >
          <CircleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Could not load the project documentation</AlertTitle>
          <AlertDescription className="text-red-800 dark:text-red-300">
            <p>{note || "The docs API request failed."}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-11 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "not_available" ? (
        <Card className="bg-zinc-50 dark:bg-zinc-900/40">
          <CardContent className="flex items-start gap-3">
            <CircleAlert
              className="mt-0.5 size-5 shrink-0 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Project documentation is not available
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {note}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {state === "ready" && docs.length > 0 ? (
        <DocsTabs docs={docs} note={note} />
      ) : null}
    </section>
  );
}

function DocsTabs({ docs, note }: { docs: Phase1Doc[]; note: string }) {
  return (
    <Card className="gap-0 p-4 sm:p-6">
      <p className="sr-only">
        Project documentation with {docs.length} documents:{" "}
        {docs.map((doc) => doc.title).join(", ")}. Each document can be
        downloaded as markdown.
      </p>
      <Tabs defaultValue={docs[0]?.slug}>
        <TabsList className="h-12 w-full max-w-md sm:w-auto">
          {docs.map((doc) => (
            <TabsTrigger key={doc.slug} value={doc.slug}>
              {doc.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {docs.map((doc) => (
          <TabsContent key={doc.slug} value={doc.slug} className="mt-4">
            <DocPanel doc={doc} />
          </TabsContent>
        ))}
      </Tabs>

      {note ? (
        <p className="mt-3 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          {note}
        </p>
      ) : null}
    </Card>
  );
}

function DocPanel({ doc }: { doc: Phase1Doc }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tocBoxRef = useRef<HTMLDivElement | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const { matchCount, activeIndex, next, prev } = useFindInDoc(
    containerRef,
    committedQuery,
    doc.slug,
  );
  const toc = useMemo(() => extractToc(doc.content), [doc.content]);
  const activeHeadingId = useActiveHeading(toc, doc.slug);

  /* Keep the highlighted TOC entry inside the (scrollable) contents box —
     centered vertically instead of snapping, so rapid heading hops read
     smoothly. The box is `relative`, so offsetTop is box-relative. */
  useEffect(() => {
    const box = tocBoxRef.current;
    if (!box || !activeHeadingId) {
      return;
    }
    const btn = box.querySelector<HTMLElement>(
      `button[data-toc-id="${activeHeadingId}"]`,
    );
    if (!btn) {
      return;
    }
    const top = btn.offsetTop;
    const bottom = top + btn.offsetHeight;
    if (
      top < box.scrollTop + 4 ||
      bottom > box.scrollTop + box.clientHeight - 4
    ) {
      box.scrollTo({
        top: Math.max(0, top - box.clientHeight / 2 + btn.offsetHeight / 2),
        behavior: "smooth",
      });
    }
  }, [activeHeadingId]);

  const scrollToHeading = useCallback((id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  // Debounce the input so typing doesn't re-walk the DOM per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setCommittedQuery(draftQuery),
      FIND_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const clearFind = useCallback(() => {
    setDraftQuery("");
    setCommittedQuery("");
    inputRef.current?.focus();
  }, []);

  const searching = committedQuery.trim().length >= FIND_MIN_LENGTH;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {doc.title}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {doc.description}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="font-mono">{doc.path}</span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(doc.bytes)}</span>
            <span aria-hidden="true">·</span>
            <span>modified {formatModifiedDate(doc)}</span>
            <span aria-hidden="true">·</span>
            <span>served from the repository</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          onClick={() => downloadMarkdown(doc)}
          aria-label={`Download ${doc.title} as markdown`}
        >
          <Download className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Download .md</span>
          <span className="sm:hidden">.md</span>
        </Button>
      </div>

      {/* Table of contents + document body: side column on large screens,
          stacked above the body on small ones. The ids are line-number based
          so the nav and the rendered headings can never desync. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(170px,210px)_minmax(0,1fr)]">
        {toc.length >= TOC_MIN_HEADINGS ? (
          <nav
            aria-label={`Table of contents — ${doc.title}`}
            /* min-w-0 lets the grid item shrink below its content's
               min-content width — without it the TOC poked 3px past the
               viewport on 390px screens (grid items default to
               min-width:auto). */
            className="min-w-0 print:hidden"
          >
            <div
              ref={tocBoxRef}
              className={cn(
                SCROLLABLE_LIST_CLASS,
                "relative max-h-44 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 lg:max-h-[28rem] dark:border-zinc-800 dark:bg-zinc-900/40",
              )}
            >
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <ListTree className="size-3" aria-hidden="true" />
                Contents
                <span className="ml-auto font-mono normal-case text-zinc-400 dark:text-zinc-500">
                  {toc.length}
                </span>
              </p>
              <ul className="mt-2 space-y-0.5">
                {toc.map((entry) => {
                  const active = activeHeadingId === entry.id;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        data-toc-id={entry.id}
                        onClick={() => scrollToHeading(entry.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "block w-full truncate rounded-md border-l-2 py-1 pr-2 text-left text-xs leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                          entry.level === 2
                            ? "font-medium"
                            : "pl-5 text-[11px] font-normal",
                          entry.level === 2 ? "pl-3" : null,
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-transparent text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800 dark:text-zinc-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300",
                        )}
                        title={`Jump to “${entry.text}”`}
                      >
                        {entry.text}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        ) : null}

        <div className="min-w-0 space-y-4">
      <div
        className="flex flex-wrap items-center gap-2 print:hidden"
        role="search"
        aria-label={`Find in ${doc.title}`}
      >
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) {
                  prev();
                } else {
                  next();
                }
              } else if (event.key === "Escape" && draftQuery) {
                event.preventDefault();
                clearFind();
              }
            }}
            placeholder="Find in this document…"
            aria-label={`Find text within ${doc.title}`}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-8 text-sm text-zinc-800 shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-emerald-400"
          />
          {draftQuery ? (
            <button
              type="button"
              onClick={clearFind}
              aria-label="Clear the find query"
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p
          aria-live="polite"
          className="order-last w-full text-xs tabular-nums text-zinc-500 dark:text-zinc-400 sm:order-none sm:w-auto"
        >
          {searching
            ? matchCount > 0
              ? `${activeIndex + 1} / ${matchCount} match${matchCount === 1 ? "" : "es"}`
              : "No matches"
            : `Search inside the rendered document (min ${FIND_MIN_LENGTH} characters)`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={prev}
            disabled={matchCount === 0}
            aria-label="Previous match (Shift+Enter)"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={next}
            disabled={matchCount === 0}
            aria-label="Next match (Enter)"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* The rendered markdown scrolls internally so long documents do not
          dominate the page (slim theme-aware scrollbar, like the bar lists). */}
          <div
            ref={containerRef}
            role="region"
            className={cn(SCROLLABLE_LIST_CLASS, "max-h-[28rem] pl-1")}
            tabIndex={0}
            aria-label={`${doc.title} content`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {doc.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading project documentation…</p>
      <Card className="gap-0 p-4 sm:p-6" aria-hidden="true">
        <Skeleton className="skeleton-shimmer h-11 w-72" />
        <Skeleton className="skeleton-shimmer mt-4 h-16 w-full" />
        <Skeleton className="skeleton-shimmer mt-4 h-5 w-2/5" />
        <Skeleton className="skeleton-shimmer mt-3 h-4 w-full" />
        <Skeleton className="skeleton-shimmer mt-2 h-4 w-full" />
        <Skeleton className="skeleton-shimmer mt-2 h-4 w-4/5" />
        <Skeleton className="skeleton-shimmer mt-2 h-4 w-3/5" />
      </Card>
    </div>
  );
}
