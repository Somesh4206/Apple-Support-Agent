/**
 * Server-only helpers for reading the Phase 1 artifacts that the Python
 * pipeline writes into hiver-support-agent/data/processed/.
 *
 * Nothing in this module may be imported from client components — it uses
 * node:fs and is only consumed by route handlers under src/app/api/.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { CHART_NAMES, type PipelineRun } from "@/lib/phase1";

/** Absolute path of the processed artifacts directory. */
export const PROCESSED_DIR = path.join(
  process.cwd(),
  "hiver-support-agent",
  "data",
  "processed",
);

/** Absolute path of the matplotlib chart PNGs. */
export const CHARTS_DIR = path.join(PROCESSED_DIR, "charts");

export interface ReadJsonResult<T> {
  ok: boolean;
  data?: T;
  /** "NOT_RUN" (file missing), "UNREADABLE" (IO error) or "INVALID" (bad JSON) */
  code: "NOT_RUN" | "UNREADABLE" | "INVALID";
  message: string;
}

/**
 * Read and JSON-parse a file from data/processed/ without ever throwing.
 * A missing file is reported as NOT_RUN — a valid pipeline state, not an error.
 */
export async function readProcessedJson<T>(
  fileName: string,
): Promise<ReadJsonResult<T>> {
  let text: string;
  try {
    text = await readFile(path.join(PROCESSED_DIR, fileName), "utf-8");
  } catch (error) {
    const isMissing =
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      ok: false,
      code: isMissing ? "NOT_RUN" : "UNREADABLE",
      message: isMissing
        ? `${fileName} does not exist yet — run the Phase 1 pipeline to generate it.`
        : `${fileName} exists but could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T, code: "NOT_RUN", message: "" };
  } catch {
    return {
      ok: false,
      code: "INVALID",
      message: `${fileName} exists but is not valid JSON — re-run the Phase 1 pipeline to regenerate it.`,
    };
  }
}

/** Convenience wrapper for the pipeline run manifest. */
export function readPipelineRun(): Promise<ReadJsonResult<PipelineRun>> {
  return readProcessedJson<PipelineRun>("pipeline_run.json");
}

/**
 * Read one of the whitelisted matplotlib chart PNGs.
 * Returns null when the name is unknown or the file is missing.
 */
export async function readChartPng(
  name: string | null,
): Promise<Buffer | null> {
  if (!name || !CHART_NAMES.includes(name)) {
    return null;
  }
  try {
    return await readFile(path.join(CHARTS_DIR, `${name}.png`));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* conversation_pairs.csv loader (in-memory cache)                     */
/* ------------------------------------------------------------------ */

export interface ConversationRow {
  /** numeric conversation id as string — used for display and stable ordering */
  conversation_id: string;
  turn: number;
  customer_message: string;
  support_response: string;
  created_at: string;
}

/** Escapes regex metacharacters so a query like "c++" is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive substring test that avoids materializing a lowercased
 * copy of every message per request (the old approach stored a `search_text`
 * duplicate per row, roughly doubling the cache footprint; a compiled regex
 * tests the original strings in place).
 */
export function makeRowMatcher(query: string): (row: ConversationRow) => boolean {
  const pattern = new RegExp(escapeRegExp(query), "i");
  return (row) =>
    pattern.test(row.customer_message) || pattern.test(row.support_response);
}

/**
 * Term-frequency relevance score for one row: every case-insensitive
 * occurrence of the query counts, customer-message hits weigh double
 * (the customer utterance is the intent source for later phases).
 * Returns 0 when the query is empty (relevance is meaningless then).
 */
export function makeRowScorer(
  query: string,
): (row: ConversationRow) => number {
  const trimmed = query.trim();
  if (!trimmed) {
    return () => 0;
  }
  const pattern = new RegExp(escapeRegExp(trimmed), "gi");
  const countOccurrences = (text: string): number => {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  };
  return (row) =>
    2 * countOccurrences(row.customer_message) +
    countOccurrences(row.support_response);
}

interface ConversationCache {
  mtimeMs: number;
  rows: ConversationRow[];
  parseMs: number;
}

/** Module-level cache; survives across requests in the dev server process. */
let conversationCache: ConversationCache | null = null;

/**
 * Minimal RFC-4180 CSV parser (quoted fields with embedded commas, quotes
 * and newlines) sufficient for the pipeline's output files.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const length = text.length;
  for (let i = 0; i < length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (char === "\r") {
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Lightweight existence/size probe for the conversation_pairs.csv artifact.
 * Used by the startup instrumentation hook so NOT_RUN states are visible in
 * dev.log WITHOUT paying the several-hundred-MB resident cost of the full
 * row cache (see instrumentation.ts for why the cache is lazy now).
 */
export async function statConversationPairsArtifact(): Promise<{
  exists: boolean;
  path: string;
  sizeBytes: number;
}> {
  const filePath = path.join(PROCESSED_DIR, "conversation_pairs.csv");
  try {
    const info = await stat(filePath);
    return { exists: true, path: filePath, sizeBytes: info.size };
  } catch {
    return { exists: false, path: filePath, sizeBytes: 0 };
  }
}

/**
 * Load conversation_pairs.csv into memory (once per file version).
 * The cache is keyed on the file's mtime so a pipeline re-run is picked up
 * automatically on the next request.
 */
export async function loadConversationPairs(): Promise<{
  rows: ConversationRow[];
  cache: "cold" | "warm";
  parseMs: number;
  error?: string;
}> {
  const filePath = path.join(PROCESSED_DIR, "conversation_pairs.csv");
  let mtimeMs: number;
  try {
    const info = await stat(filePath);
    mtimeMs = info.mtimeMs;
  } catch {
    return {
      rows: [],
      cache: "cold",
      parseMs: 0,
      error:
        "conversation_pairs.csv does not exist yet — run the Phase 1 pipeline to generate it.",
    };
  }

  if (conversationCache && conversationCache.mtimeMs === mtimeMs) {
    return { rows: conversationCache.rows, cache: "warm", parseMs: conversationCache.parseMs };
  }

  const started = Date.now();
  let text: string;
  try {
    text = await readFile(filePath, "utf-8");
  } catch (error) {
    return {
      rows: [],
      cache: "cold",
      parseMs: 0,
      error: `conversation_pairs.csv could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const parsed = parseCsv(text);
  const header = parsed.shift() ?? [];
  const index = {
    conversation_id: header.indexOf("conversation_id"),
    customer_message: header.indexOf("customer_message"),
    support_response: header.indexOf("support_response"),
    created_at: header.indexOf("created_at"),
    turn: header.indexOf("turn"),
  };
  const at = (row: string[], i: number): string => (i >= 0 && i < row.length ? row[i] : "");

  const rows: ConversationRow[] = parsed
    .filter((cells) => cells.length > 1)
    .map((cells) => ({
      customer_message: at(cells, index.customer_message),
      support_response: at(cells, index.support_response),
      conversation_id: at(cells, index.conversation_id).trim(),
      turn: Number.parseInt(at(cells, index.turn), 10) || 0,
      created_at: at(cells, index.created_at).trim(),
    }));
  // Deterministic base order: ascending numeric conversation id.
  rows.sort((a, b) => {
    const ai = Number(a.conversation_id);
    const bi = Number(b.conversation_id);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) {
      return ai - bi;
    }
    return a.conversation_id.localeCompare(b.conversation_id);
  });

  const parseMs = Date.now() - started;
  conversationCache = { mtimeMs, rows, parseMs };
  return { rows, cache: "cold", parseMs };
}
