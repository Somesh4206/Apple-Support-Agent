"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Dices,
  Download,
  FileJson,
  History,
  Link2,
  MessagesSquare,
  RefreshCw,
  Search,
  SearchX,
  Sparkles,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationCard } from "@/components/phase1/conversation-card";
import { SectionHeading } from "@/components/phase1/section-heading";
import { ThreadDialog } from "@/components/phase1/thread-dialog";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/clipboard";
import {
  formatInt,
  type Phase1ConversationsResponse,
} from "@/lib/phase1";
import { cn } from "@/lib/utils";

type SortValue = "id" | "turns_desc" | "longest" | "relevance";
type MinTurnsValue = "any" | "2" | "5" | "10" | "20";
type MaxTurnsValue = "any" | "2" | "4" | "8";

const SORT_OPTIONS = [
  { value: "id" as const, label: "Conversation ID" },
  { value: "turns_desc" as const, label: "Most turns" },
  { value: "longest" as const, label: "Longest customer message" },
  {
    value: "relevance" as const,
    label: "Relevance (needs a search)",
  },
];

const MIN_TURNS_OPTIONS = [
  { value: "any" as const, label: "Any" },
  { value: "2" as const, label: "2+ turns" },
  { value: "5" as const, label: "5+ turns" },
  { value: "10" as const, label: "10+ turns" },
  { value: "20" as const, label: "20+ turns" },
];

const MAX_TURNS_OPTIONS = [
  { value: "any" as const, label: "Any" },
  { value: "2" as const, label: "≤ 2 turns" },
  { value: "4" as const, label: "≤ 4 turns" },
  { value: "8" as const, label: "≤ 8 turns" },
];

const PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 350;
/** Hard cap enforced by the CSV export mode of /api/phase1/conversations. */
const EXPORT_ROW_CAP = 10_000;
/** localStorage key for the recent-searches chip row. */
const RECENT_SEARCHES_KEY = "phase1-recent-searches";
/** Number of remembered searches. */
const RECENT_SEARCHES_MAX = 5;
/** localStorage key for the saved-filter presets. */
const FILTER_PRESETS_KEY = "phase1-filter-presets";
/** Number of saved filter presets kept. */
const FILTER_PRESETS_MAX = 6;

/** One saved explorer filter combination (page is deliberately excluded). */
interface FilterPreset {
  q: string;
  sort: SortValue;
  minTurns: MinTurnsValue;
  maxTurns: MaxTurnsValue;
}

/** Stable identity for deduplication (two presets are the same filters). */
function presetKey(preset: FilterPreset): string {
  return JSON.stringify([
    preset.q.trim().toLowerCase(),
    preset.sort,
    preset.minTurns,
    preset.maxTurns,
  ]);
}

/** Human label for the chip row, e.g. "battery · 5+ turns". */
function presetLabel(preset: FilterPreset): string {
  const parts: string[] = [preset.q.trim() || "all pairs"];
  if (preset.sort !== "id") {
    const option = SORT_OPTIONS.find((o) => o.value === preset.sort);
    parts.push(option ? option.label.split(" (")[0].toLowerCase() : preset.sort);
  }
  if (preset.minTurns !== "any") {
    parts.push(`${preset.minTurns}+ turns`);
  }
  if (preset.maxTurns !== "any") {
    parts.push(`≤ ${preset.maxTurns} turns`);
  }
  return parts.join(" · ");
}

/** Reads the saved presets (oldest → newest) without ever throwing. */
function readFilterPresets(): FilterPreset[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FILTER_PRESETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (typeof entry !== "string") {
          return null;
        }
        try {
          const value = JSON.parse(entry) as Partial<FilterPreset>;
          if (
            typeof value.q !== "string" ||
            typeof value.sort !== "string" ||
            typeof value.minTurns !== "string" ||
            typeof value.maxTurns !== "string"
          ) {
            return null;
          }
          // Re-validate against the option lists so stale/renamed enum
          // values from older sessions cannot crash the explorer.
          if (
            !SORT_OPTIONS.some((o) => o.value === value.sort) ||
            !MIN_TURNS_OPTIONS.some((o) => o.value === value.minTurns) ||
            !MAX_TURNS_OPTIONS.some((o) => o.value === value.maxTurns)
          ) {
            return null;
          }
          return {
            q: value.q.slice(0, 100),
            sort: value.sort as SortValue,
            minTurns: value.minTurns as MinTurnsValue,
            maxTurns: value.maxTurns as MaxTurnsValue,
          };
        } catch {
          return null;
        }
      })
      .filter((preset): preset is FilterPreset => preset !== null)
      .slice(-FILTER_PRESETS_MAX);
  } catch {
    return [];
  }
}

/** Persists the saved presets without ever throwing. */
function writeFilterPresets(presets: FilterPreset[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      FILTER_PRESETS_KEY,
      JSON.stringify(presets.slice(-FILTER_PRESETS_MAX)),
    );
  } catch {
    // Quota/private mode — presets are a nicety, never a hard failure.
  }
}
const CONTROL_LABEL_CLASS =
  "text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/** Reads the recent-searches list (oldest → newest) without ever throwing. */
function readRecentSearches(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === "string")
      .filter((item) => item.trim().length >= 2)
      .slice(-RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

/** Persists the recent-searches list without ever throwing. */
function writeRecentSearches(items: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(items.slice(-RECENT_SEARCHES_MAX)),
    );
  } catch {
    // Quota/private mode — chips are a nicety, never a hard failure.
  }
}

/**
 * Classic dynamic-programming edit distance (bounded early-exit), used to
 * suggest corpus terms when a search returns zero results.
 */
function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (Math.abs(a.length - b.length) > 3) {
    return Number.POSITIVE_INFINITY;
  }
  const rows = b.length + 1;
  let previous = Array.from({ length: rows }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i, ...Array.from({ length: rows - 1 }, () => 0)];
    for (let j = 1; j < rows; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[rows - 1];
}

/**
 * Up to three corpus terms close to a zero-hit query: prefix matches first,
 * then edit-distance ≤ 2 fixes. Case-insensitive, deduplicated.
 */
function suggestTerms(
  query: string,
  corpusTerms: string[] | undefined,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!corpusTerms || needle.length < 2) {
    return [];
  }
  const seen = new Set<string>();
  const prefixes: string[] = [];
  const fixes: Array<{ term: string; distance: number }> = [];
  for (const raw of corpusTerms) {
    const term = raw.trim().toLowerCase();
    if (!term || term === needle || seen.has(term)) {
      continue;
    }
    if (term.startsWith(needle)) {
      seen.add(term);
      prefixes.push(term);
      continue;
    }
    const distance = editDistance(needle, term);
    if (distance <= 2) {
      seen.add(term);
      fixes.push({ term, distance });
    }
  }
  fixes.sort((a, b) => a.distance - b.distance);
  return [...prefixes, ...fixes.map((fix) => fix.term)].slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* URL parameter round-tripping                                        */
/* ------------------------------------------------------------------ */

/** Explorer state as mirrored into the URL query string. */
interface ExplorerUrlState {
  q: string;
  sort: SortValue;
  minTurns: MinTurnsValue;
  maxTurns: MaxTurnsValue;
  page: number;
}

function parseSortParam(value: string | null): SortValue {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as SortValue)
    : "id";
}

function parseMinTurnsParam(value: string | null): MinTurnsValue {
  return MIN_TURNS_OPTIONS.some((option) => option.value === value)
    ? (value as MinTurnsValue)
    : "any";
}

function parseMaxTurnsParam(value: string | null): MaxTurnsValue {
  return MAX_TURNS_OPTIONS.some((option) => option.value === value)
    ? (value as MaxTurnsValue)
    : "any";
}

function parsePageParam(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** Reads the explorer state encoded in a query string (defaults stripped). */
function readExplorerState(search: string): ExplorerUrlState {
  const params = new URLSearchParams(search);
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    sort: parseSortParam(params.get("sort")),
    minTurns: parseMinTurnsParam(params.get("minTurns")),
    maxTurns: parseMaxTurnsParam(params.get("maxTurns")),
    page: parsePageParam(params.get("page")),
  };
}

/** True when the URL carries non-default explorer state (a deep link).
 *  Deep-linked views must restore immediately — only plain visits defer
 *  the corpus fetch (see the IntersectionObserver below). */
function urlHasExplorerState(search: string): boolean {
  const state = readExplorerState(search);
  return (
    state.q !== "" ||
    state.sort !== "id" ||
    state.minTurns !== "any" ||
    state.maxTurns !== "any" ||
    state.page > 1
  );
}

/** Serializes the state back into a clean query string (defaults omitted). */
function buildExplorerSearch(state: ExplorerUrlState): string {
  const params = new URLSearchParams();
  if (state.q) {
    params.set("q", state.q);
  }
  if (state.sort !== "id") {
    params.set("sort", state.sort);
  }
  if (state.minTurns !== "any") {
    params.set("minTurns", state.minTurns);
  }
  if (state.maxTurns !== "any") {
    params.set("maxTurns", state.maxTurns);
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }
  return params.toString();
}

function isSameExplorerState(a: ExplorerUrlState, b: ExplorerUrlState): boolean {
  return (
    a.q === b.q &&
    a.sort === b.sort &&
    a.minTurns === b.minTurns &&
    a.maxTurns === b.maxTurns &&
    a.page === b.page
  );
}

/**
 * "Conversation explorer" section — search, sort, turn-count filters and
 * pagination over the 106,137 reconstructed customer ↔ support pairs,
 * served by GET /api/phase1/conversations.
 *
 * The active filters round-trip through the URL query string (q / sort /
 * minTurns / maxTurns / page) so views are shareable and the browser
 * Back/Forward buttons step through them. Filter edits replace the current
 * history entry; page flips push a new one.
 */
/** Corpus terms (top terms + bigrams from the EDA summary) for zero-result suggestions. */
export interface ConversationExplorerProps {
  suggestionTerms?: string[];
}

export function ConversationExplorer({
  suggestionTerms,
}: ConversationExplorerProps) {
  const { toast } = useToast();
  // Initial state comes from the URL so deep links like /?q=battery&sort=turns_desc
  // restore the explorer. The component is wrapped in <Suspense> by page.tsx.
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(() =>
    readExplorerState(`?${searchParams.toString()}`).q,
  );
  const [appliedQuery, setAppliedQuery] = useState(searchInput);
  const [sort, setSort] = useState<SortValue>(() =>
    parseSortParam(searchParams.get("sort")),
  );
  const [minTurns, setMinTurns] = useState<MinTurnsValue>(() =>
    parseMinTurnsParam(searchParams.get("minTurns")),
  );
  const [maxTurns, setMaxTurns] = useState<MaxTurnsValue>(() =>
    parseMaxTurnsParam(searchParams.get("maxTurns")),
  );
  const [page, setPage] = useState(() => parsePageParam(searchParams.get("page")));
  const [reloadKey, setReloadKey] = useState(0);

  const [result, setResult] = useState<Phase1ConversationsResponse | null>(
    null,
  );
  /** False until the explorer nears the viewport (or a deep link targets
   *  it). The first /api/phase1/conversations request builds a ~300 MB
   *  server-side corpus cache; deferring it keeps the initial page load
   *  light on this 4 GB sandbox and stops the kernel OOM killer from
   *  murdering the dev server whenever the preview panel reloads. */
  const [visible, setVisible] = useState(() =>
    urlHasExplorerState(`?${searchParams.toString()}`),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notRun, setNotRun] = useState<string | null>(null);
  /** Conversation whose thread is open in the ThreadDialog (null = closed). */
  const [threadTarget, setThreadTarget] = useState<{
    conversationId: string;
    turn: number;
  } | null>(null);
  /** Recent searches loaded after mount (localStorage is client-only). */
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  /** Saved filter presets loaded after mount (localStorage is client-only). */
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  /** Latest results for the arrow-key pagination listener (stale-closure safe). */
  const resultRef = useRef<Phase1ConversationsResponse | null>(null);
  resultRef.current = result;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** When Back/Forward adopts URL state, the next URL write is skipped. */
  const skipUrlWriteRef = useRef(false);
  /** Last state mirrored into the URL (drives push vs replace). */
  const mirroredUrlStateRef = useRef<ExplorerUrlState>({
    q: appliedQuery,
    sort,
    minTurns,
    maxTurns,
    page,
  });

  // Debounce the search box: apply the query (and reset to page 1) 350 ms
  // after the last keystroke.
  useEffect(() => {
    if (appliedQuery === searchInput) {
      return;
    }
    const timer = setTimeout(() => {
      setAppliedQuery(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, appliedQuery]);

  // Flip `visible` once the explorer section approaches the viewport
  // (800px lead). One-shot: once visible, always visible, so later filter
  // changes fetch as before. Deep links start visible (see useState above).
  // Environments without IntersectionObserver fall back to eager loading.
  useEffect(() => {
    if (visible) {
      return;
    }
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px 800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  // Load the recent-searches list and saved presets once on mount
  // (client-only storage).
  useEffect(() => {
    setRecentSearches(readRecentSearches());
    setFilterPresets(readFilterPresets());
  }, []);

  // Relevance ranking is meaningless without a search term — fall back to
  // the deterministic id order the moment the query is cleared.
  useEffect(() => {
    if (sort === "relevance" && appliedQuery.trim().length < 2) {
      setSort("id");
    }
  }, [sort, appliedQuery]);

  // Remember meaningful applied queries (most recent last, deduplicated).
  useEffect(() => {
    const query = appliedQuery.trim();
    if (query.length < 2) {
      return;
    }
    setRecentSearches((current) => {
      const next = [
        ...current.filter((item) => item !== query),
        query,
      ].slice(-RECENT_SEARCHES_MAX);
      writeRecentSearches(next);
      return next;
    });
  }, [appliedQuery]);

  // Applies a recent-search chip in one tap (input + applied state + page 1).
  function applyRecentSearch(query: string) {
    setSearchInput(query);
    setAppliedQuery(query);
    setPage(1);
    searchInputRef.current?.focus();
  }

  function forgetRecentSearch(query: string) {
    setRecentSearches((current) => {
      const next = current.filter((item) => item !== query);
      writeRecentSearches(next);
      return next;
    });
  }

  // The current filter combination as a preset (page deliberately excluded —
  // restoring always lands on page 1 of the result set).
  const currentPreset: FilterPreset = {
    q: appliedQuery.trim().slice(0, 100),
    sort,
    minTurns,
    maxTurns,
  };
  const presetAlreadySaved = filterPresets.some(
    (preset) => presetKey(preset) === presetKey(currentPreset),
  );

  // Snapshots the active filters as a preset chip (deduplicated, max 6).
  function savePreset() {
    const preset = currentPreset;
    setFilterPresets((current) => {
      if (
        current.some((item) => presetKey(item) === presetKey(preset))
      ) {
        return current;
      }
      const next = [...current, preset].slice(-FILTER_PRESETS_MAX);
      writeFilterPresets(next);
      return next;
    });
    toast({
      title: "Filter preset saved",
      description: `“${presetLabel(preset)}” is now one tap away in this browser.`,
    });
  }

  // Restores a preset in one tap: filters + page 1 + a toast confirms it.
  function applyPreset(preset: FilterPreset) {
    setSearchInput(preset.q);
    setAppliedQuery(preset.q);
    setSort(preset.sort);
    setMinTurns(preset.minTurns);
    setMaxTurns(preset.maxTurns);
    setPage(1);
    toast({
      title: "Preset applied",
      description: `“${presetLabel(preset)}” — results are refreshed below.`,
    });
  }

  function forgetPreset(preset: FilterPreset) {
    setFilterPresets((current) => {
      const next = current.filter(
        (item) => presetKey(item) !== presetKey(preset),
      );
      writeFilterPresets(next);
      return next;
    });
  }

  // Mirror the applied explorer state into the URL. Pure filter changes
  // replace the current history entry (typing must not spam history);
  // flipping pages pushes an entry so Back returns to the previous page.
  useEffect(() => {
    const next: ExplorerUrlState = {
      q: appliedQuery,
      sort,
      minTurns,
      maxTurns,
      page,
    };
    const previous = mirroredUrlStateRef.current;
    mirroredUrlStateRef.current = next;
    if (skipUrlWriteRef.current) {
      // The URL already reflects this state (Back/Forward navigation).
      skipUrlWriteRef.current = false;
      return;
    }
    const onlyPageChanged =
      next.page !== previous.page &&
      next.q === previous.q &&
      next.sort === previous.sort &&
      next.minTurns === previous.minTurns &&
      next.maxTurns === previous.maxTurns;
    const search = buildExplorerSearch(next);
    const url = search ? `/?${search}` : "/";
    if (onlyPageChanged) {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
  }, [appliedQuery, sort, minTurns, maxTurns, page]);

  // Back/Forward: adopt whatever the URL now says without re-writing it.
  useEffect(() => {
    const onPopState = () => {
      const next = readExplorerState(window.location.search);
      if (isSameExplorerState(next, mirroredUrlStateRef.current)) {
        return;
      }
      skipUrlWriteRef.current = true;
      setSearchInput(next.q);
      setAppliedQuery(next.q);
      setSort(next.sort);
      setMinTurns(next.minTurns);
      setMaxTurns(next.maxTurns);
      setPage(next.page);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Pressing "/" (outside inputs, textareas, selects and open dialogs or
  // popovers) focuses the search box and selects its contents.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target.isContentEditable
        ) {
          return;
        }
        if (
          target.closest(
            '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]',
          ) !== null
        ) {
          return;
        }
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Arrow keys step through pages while not typing in a field (same guards
  // as the "/" shortcut). Pagination state lives in this component, so the
  // listener is attached here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          target.isContentEditable
        ) {
          return;
        }
        if (
          target.closest(
            '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"], [data-radix-popper-content-wrapper]',
          ) !== null
        ) {
          return;
        }
      }
      // Only act when there are results to page through.
      const totalPages = resultRef.current?.totalPages ?? 0;
      if (totalPages < 2) {
        return;
      }
      event.preventDefault();
      if (event.key === "ArrowLeft") {
        setPage((current) => Math.max(1, current - 1));
      } else {
        setPage((current) => Math.min(totalPages, current + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Fetch the current page whenever the applied filters change — but only
  // after the explorer has been approached (see `visible` above).
  useEffect(() => {
    if (!visible) {
      return;
    }
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      const query = appliedQuery.trim().slice(0, 100);
      const params = new URLSearchParams();
      if (query) {
        params.set("q", query);
      }
      if (sort !== "id") {
        params.set("sort", sort);
      }
      if (minTurns !== "any") {
        params.set("minTurns", minTurns);
      }
      if (maxTurns !== "any") {
        params.set("maxTurns", maxTurns);
      }
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      try {
        const response = await fetch(
          `/api/phase1/conversations?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`);
        }
        const payload =
          (await response.json()) as Phase1ConversationsResponse;
        if (!active) {
          return;
        }
        if (payload.ok) {
          setResult(payload);
          setNotRun(null);
        } else {
          setResult(null);
          setNotRun(
            payload.message ??
              "Conversation pairs are not available yet (conversation_pairs.csv is missing).",
          );
        }
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setResult(null);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to reach the conversations API.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [visible, appliedQuery, sort, minTurns, maxTurns, page, reloadKey]);

  const hasActiveFilters =
    searchInput.trim() !== "" ||
    sort !== "id" ||
    minTurns !== "any" ||
    maxTurns !== "any";

  function clearFilters() {
    setSearchInput("");
    setAppliedQuery("");
    setSort("id");
    setMinTurns("any");
    setMaxTurns("any");
    setPage(1);
  }

  // Exports mirror the JSON query (minus paging) and let the server's
  // Content-Disposition header handle the download. CSV keeps the flat
  // spreadsheet layout; JSON wraps the same rows with the active filters and
  // row counts so the file is self-describing.
  const trimmedQuery = appliedQuery.trim().slice(0, 100);
  const exportHref = (format: "csv" | "json") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (format === "json") {
      params.set("download", "1");
    }
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    if (sort !== "id") {
      params.set("sort", sort);
    }
    if (minTurns !== "any") {
      params.set("minTurns", minTurns);
    }
    if (maxTurns !== "any") {
      params.set("maxTurns", maxTurns);
    }
    return `/api/phase1/conversations?${params.toString()}`;
  };

  const exportDisabled = loading || !result || result.total === 0;
  const exportHint =
    result && result.total > EXPORT_ROW_CAP
      ? `Exports the first ${formatInt(EXPORT_ROW_CAP)} of ${formatInt(result.total)} matching rows.`
      : `Exports up to ${formatInt(EXPORT_ROW_CAP)} matching rows.`;

  function triggerDownload(format: "csv" | "json") {
    if (exportDisabled) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = exportHref(format);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast({
      title: `${format.toUpperCase()} export started`,
      description: `Downloading the current filtered results${
        result && result.total > EXPORT_ROW_CAP
          ? ` (first ${formatInt(EXPORT_ROW_CAP)} of ${formatInt(result.total)} rows)`
          : ""
      }${
        format === "json" ? " as a self-describing JSON document" : ""
      }. Check your browser's downloads.`,
    });
  }

  // Copies the current URL (which already mirrors the active filters) so the
  // exact view can be shared. Falls back to the bare origin when URL writing
  // has not happened yet.
  async function handleShareLink() {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}${window.location.search}`
        : "";
    const ok = await copyText(shareUrl);
    toast({
      title: ok ? "Shareable link copied" : "Copy failed",
      description: ok
        ? hasActiveFilters
          ? "The link restores the current filters — paste it anywhere."
          : "The dashboard link is on your clipboard."
        : "Your browser blocked clipboard access — copy the address bar instead.",
      variant: ok ? undefined : "destructive",
    });
  }

  // Jumps to a uniformly random page of the current result set and scrolls
  // the explorer back into view — a lightweight way to sample the corpus.
  function handleRandomPage() {
    if (!result || result.totalPages < 1 || loading) {
      return;
    }
    const randomPage =
      1 + Math.floor(Math.random() * result.totalPages);
    if (randomPage !== page) {
      setPage(randomPage);
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    toast({
      title: "Random page opened",
      description: `Jumped to page ${formatInt(randomPage)} of ${formatInt(result.totalPages)} — press ← → to keep exploring.`,
    });
  }

  // Highlights are only applied for meaningful queries (≥ 2 characters).
  const highlightTerm =
    trimmedQuery.length >= 2 ? trimmedQuery : undefined;

  const showResults =
    result !== null && result.items.length > 0 && error === null;
  const showEmpty =
    result !== null && result.items.length === 0 && error === null && !loading;

  // Zero-hit search: close corpus terms (EDA top terms + bigrams) to offer
  // as one-tap replacements — computed only for the empty state.
  const zeroHitSuggestions =
    showEmpty && trimmedQuery.length >= 2
      ? suggestTerms(trimmedQuery, suggestionTerms)
      : [];

  return (
    <section
      ref={sectionRef}
      aria-labelledby="explorer-heading"
      className="space-y-4 scroll-mt-20"
    >
      <SectionHeading
        id="explorer-heading"
        icon={Search}
        title="Conversation explorer"
        description="Search, sort and page through the reconstructed customer ↔ support pairs from conversation_pairs.csv — served live by /api/phase1/conversations. Filters are shareable via the URL."
      />

      {notRun !== null ? (
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3">
            <CircleAlert
              className="mt-0.5 size-5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Conversation pairs are not available yet
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                {notRun}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="gap-0 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="explorer-search"
                    className={CONTROL_LABEL_CLASS}
                  >
                    Search
                  </label>
                  <kbd
                    aria-hidden="true"
                    className="hidden h-4 min-w-4 items-center justify-center rounded border border-zinc-300 bg-zinc-50 px-1 font-mono text-[10px] leading-none text-zinc-500 sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    /
                  </kbd>
                </div>
                <div className="relative mt-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                    aria-hidden="true"
                  />
                  <Input
                    ref={searchInputRef}
                    id="explorer-search"
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search customer and support messages…"
                    maxLength={100}
                    className="pl-9"
                    aria-label="Search customer and support messages"
                    aria-describedby="explorer-meta"
                    aria-keyshortcuts="/"
                  />
                </div>
                {recentSearches.length > 0 && searchInput.trim() === "" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      <History className="size-3" aria-hidden="true" />
                      Recent
                    </span>
                    {recentSearches.map((query) => (
                      <span key={query} className="group/chip">
                        <button
                          type="button"
                          onClick={() => applyRecentSearch(query)}
                          className="inline-flex max-w-40 items-center truncate rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono text-xs text-zinc-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                          title={`Search for “${query}” again`}
                        >
                          {query}
                        </button>
                        <button
                          type="button"
                          onClick={() => forgetRecentSearch(query)}
                          className="-ml-1.5 inline-flex size-4 items-center justify-center rounded-full text-zinc-300 transition-colors hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-zinc-600 dark:hover:text-zinc-300"
                          aria-label={`Remove “${query}” from recent searches`}
                          title="Remove from recent searches"
                        >
                          <X className="size-2.5" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                {filterPresets.length > 0 ? (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1.5"
                    aria-label="Saved filter presets"
                  >
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      <Bookmark className="size-3" aria-hidden="true" />
                      Presets
                    </span>
                    {filterPresets.map((preset) => (
                      <span
                        key={presetKey(preset)}
                        className="group/chip"
                      >
                        <button
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="inline-flex max-w-56 items-center truncate rounded-full border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 text-xs text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                          title={`Apply the saved filter preset “${presetLabel(preset)}”`}
                        >
                          {presetLabel(preset)}
                        </button>
                        <button
                          type="button"
                          onClick={() => forgetPreset(preset)}
                          className="-ml-1.5 inline-flex size-4 items-center justify-center rounded-full text-zinc-300 transition-colors hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-zinc-600 dark:hover:text-zinc-300"
                          aria-label={`Remove the preset “${presetLabel(preset)}”`}
                          title="Remove this preset"
                        >
                          <X className="size-2.5" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="explorer-sort"
                  className={CONTROL_LABEL_CLASS}
                >
                  Sort
                </label>
                <Select
                  value={sort}
                  onValueChange={(value) => {
                    const next = SORT_OPTIONS.find(
                      (option) => option.value === value,
                    );
                    if (next) {
                      setSort(next.value);
                      setPage(1);
                    }
                  }}
                >
                  <SelectTrigger
                    id="explorer-sort"
                    className="mt-1 w-44"
                    aria-label="Sort conversations"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={
                          option.value === "relevance" &&
                          appliedQuery.trim().length < 2
                        }
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sort === "relevance" ? (
                  <p className="mt-1.5 text-[11px] leading-snug text-emerald-700 dark:text-emerald-400">
                    Term frequency · customer-message hits ×2.
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="explorer-min-turns"
                  className={CONTROL_LABEL_CLASS}
                >
                  Min turns
                </label>
                <Select
                  value={minTurns}
                  onValueChange={(value) => {
                    const next = MIN_TURNS_OPTIONS.find(
                      (option) => option.value === value,
                    );
                    if (next) {
                      setMinTurns(next.value);
                      setPage(1);
                    }
                  }}
                >
                  <SelectTrigger
                    id="explorer-min-turns"
                    className="mt-1 w-32"
                    aria-label="Minimum turns per conversation"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_TURNS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="explorer-max-turns"
                  className={CONTROL_LABEL_CLASS}
                >
                  Max turns
                </label>
                <Select
                  value={maxTurns}
                  onValueChange={(value) => {
                    const next = MAX_TURNS_OPTIONS.find(
                      (option) => option.value === value,
                    );
                    if (next) {
                      setMaxTurns(next.value);
                      setPage(1);
                    }
                  }}
                >
                  <SelectTrigger
                    id="explorer-max-turns"
                    className="mt-1 w-32"
                    aria-label="Maximum turns per conversation"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAX_TURNS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className={cn(CONTROL_LABEL_CLASS, "block")}>
                  Tools
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={savePreset}
                    disabled={!hasActiveFilters || presetAlreadySaved}
                    title={
                      presetAlreadySaved
                        ? "The current filters are already saved as a preset"
                        : "Save the current filters (search, sort, turn range) as a one-tap preset"
                    }
                  >
                    {presetAlreadySaved ? (
                      <Bookmark className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="size-4" aria-hidden="true" />
                    )}
                    <span className="hidden md:inline">
                      {presetAlreadySaved ? "Saved" : "Save preset"}
                    </span>
                    <span className="sr-only">Save the current filter preset</span>
                  </Button>
                  {/* Export: CSV (spreadsheet) or JSON (self-describing) —
                      one dropdown, same filtered rows. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5"
                        disabled={exportDisabled}
                        title={`Download the current filtered results — ${exportHint}`}
                      >
                        <Download className="size-4" aria-hidden="true" />
                        Export
                        <ChevronDown
                          className="size-3.5 text-zinc-400"
                          aria-hidden="true"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel>
                        Download filtered rows
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => triggerDownload("csv")}
                        className="gap-2"
                      >
                        <Download className="size-4 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">CSV spreadsheet</p>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            RFC-4180 · opens in Excel / Sheets
                          </p>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => triggerDownload("json")}
                        className="gap-2"
                      >
                        <FileJson className="size-4 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">JSON document</p>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            filters + counts included · for scripts
                          </p>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <p className="px-2 pb-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                        {exportHint}
                      </p>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => void handleShareLink()}
                    title="Copy a link that restores the current filters"
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    <span className="hidden md:inline">Share</span>
                    <span className="sr-only">Copy shareable link</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={handleRandomPage}
                    disabled={loading || !result || result.totalPages < 2}
                    title="Jump to a random page of the current results"
                  >
                    <Dices className="size-4" aria-hidden="true" />
                    <span className="hidden md:inline">Surprise me</span>
                    <span className="sr-only">Jump to a random page</span>
                  </Button>
                </div>
              </div>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-zinc-600 dark:text-zinc-300"
                  onClick={clearFilters}
                >
                  <X className="size-4" aria-hidden="true" />
                  Clear filters
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              {exportHint}
            </p>
          </Card>

          <p
            id="explorer-meta"
            aria-live="polite"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            {loading
              ? "Searching…"
              : result
                ? `${formatInt(result.total)} of ${formatInt(
                    result.corpusRows,
                  )} pairs match · showing ${formatInt(
                    (result.page - 1) * PAGE_SIZE + 1,
                  )}–${formatInt(
                    Math.min(result.page * PAGE_SIZE, result.total),
                  )} · page ${formatInt(result.page)} of ${formatInt(
                    result.totalPages,
                  )} · ${
                    result.elapsedMs !== undefined
                      ? `${formatInt(result.elapsedMs)} ms`
                      : "—"
                  }`
                : "\u00A0"}
          </p>

          {error !== null ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>Could not load conversation pairs</AlertTitle>
              <AlertDescription className="text-red-800 dark:text-red-300">
                <p>{error || "The conversations API request failed."}</p>
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

          {!visible && result === null && error === null ? (
            <Card className="border-dashed bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
              <CardContent className="flex flex-col items-center gap-2.5 py-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  <MessagesSquare className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Conversation pairs load on approach
                  </p>
                  <p className="max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    The 106,137-pair corpus index (~300 MB server-side) is
                    built the first time this section scrolls into view —
                    scroll down a little and results appear in a few seconds.
                    This keeps the initial page load light.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {loading && result === null && error === null ? (
            <ResultsSkeleton />
          ) : null}

          {showEmpty ? (
            <Card className="border-dashed bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  <SearchX className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    No conversation pairs match your filters
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Try a shorter search term, widen the turn range, or clear
                    the filters to browse all {formatInt(result?.corpusRows ?? 0)}{" "}
                    pairs.
                  </p>
                </div>
                {/* Zero-hit search: suggest close corpus terms (EDA top terms
                    and bigrams) so typos cost one tap, not a dead end. */}
                {zeroHitSuggestions.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      <Sparkles className="size-3" aria-hidden="true" />
                      Did you mean
                    </span>
                    {zeroHitSuggestions.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => applyRecentSearch(term)}
                        className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-mono text-xs text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-500 dark:hover:bg-amber-950/70"
                        title={`Search for “${term}” instead`}
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                ) : null}
                {hasActiveFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11"
                    onClick={clearFilters}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Clear filters
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {showResults && result !== null ? (
            <div className="space-y-4">
              <div
                className={cn(
                  "grid gap-4 transition-opacity duration-200 md:grid-cols-2",
                  loading && "opacity-60",
                )}
              >
                {result.items.map((item, index) => (
                  <ConversationCard
                    key={`${item.conversation_id}-${item.turn}-${index}`}
                    conversation_id={item.conversation_id}
                    turn={item.turn}
                    customer_message={item.customer_message}
                    support_response={item.support_response}
                    created_at={item.created_at}
                    turnLabel={`Turn ${formatInt(item.turn)}`}
                    highlight={highlightTerm}
                    copyable
                    relevanceScore={item.score}
                    onViewThread={() =>
                      setThreadTarget({
                        conversationId: item.conversation_id,
                        turn: item.turn,
                      })
                    }
                  />
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="group h-11 gap-1"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="Previous page of results"
                >
                  <ChevronLeft
                    className="size-4 transition-transform motion-safe:group-enabled:group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                  Page {formatInt(page)} of {formatInt(result.totalPages)}
                  <span className="hidden text-zinc-400 md:inline dark:text-zinc-500">
                    {" "}· ← → to page{" "}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="group h-11 gap-1"
                  disabled={page >= result.totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                  aria-label="Next page of results"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight
                    className="size-4 transition-transform motion-safe:group-enabled:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Button>
              </div>
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 print:hidden">
                {sort === "relevance"
                  ? "Ranked by term frequency (customer-message hits ×2); ties keep the id order. Press / to search, ← → to page, ? for all shortcuts."
                  : "Ordered deterministically; searches are case-insensitive across both messages. Press / to search, ← → to page, ? for all shortcuts."}
              </p>
            </div>
          ) : null}
        </>
      )}

      {/* One thread dialog instance for the whole explorer. */}
      <ThreadDialog
        conversationId={threadTarget?.conversationId ?? null}
        focusTurn={threadTarget?.turn}
        highlight={highlightTerm}
        onClose={() => setThreadTarget(null)}
      />
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading conversation pairs…</p>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: PAGE_SIZE }).map((_, index) => (
          <Card key={index} className="gap-0 p-4" aria-hidden="true">
            <Skeleton className="skeleton-shimmer h-4 w-44" />
            <Skeleton className="skeleton-shimmer mt-3 h-14 w-3/4" />
            <Skeleton className="skeleton-shimmer ml-auto mt-3 h-14 w-3/4" />
          </Card>
        ))}
      </div>
    </div>
  );
}
