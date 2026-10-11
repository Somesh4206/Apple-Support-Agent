import { NextResponse } from "next/server";

import { loadConversationPairs, makeRowMatcher, makeRowScorer } from "@/lib/phase1-server";
import type {
  Phase1ConversationPair,
  Phase1ConversationsQuery,
  Phase1ConversationsResponse,
  Phase1ThreadResponse,
} from "@/lib/phase1";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 12;
const MAX_QUERY_LENGTH = 100;
const MAX_EXPORT_ROWS = 10_000;
const SORTS: Phase1ConversationsQuery["sort"][] = [
  "id",
  "turns_desc",
  "longest",
  "relevance",
];

function parseIntOrUndefined(
  value: string | null,
): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** RFC-4180 field escaping: wrap in quotes, double embedded quotes. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * GET /api/phase1/conversations — search/filter/page the 106,137
 * customer↔support pairs reconstructed by the Phase 1 pipeline
 * (conversation_pairs.csv).
 *
 * Query params:
 *   q        — case-insensitive substring across both messages
 *   minTurns / maxTurns — inclusive turn-count bounds
 *   page     — 1-based page number
 *   pageSize — 1..12 (default 8)
 *   sort     — "id" (default) | "turns_desc" | "longest" | "relevance"
 *              (relevance = term frequency, customer hits ×2; without q it
 *              behaves like "id")
 *   conversationId — when set, returns ALL pairs of that one conversation
 *                    ordered by turn (thread view); other filters are ignored
 *   format   — "json" (default) | "csv" — csv streams the filtered rows
 *              (same filters/sort) as a downloadable RFC-4180 file, capped
 *              at MAX_EXPORT_ROWS rows
 *   download — "1" together with format=json streams the same filtered rows
 *              as a downloadable, self-describing JSON document (filters +
 *              row counts included), also capped at MAX_EXPORT_ROWS rows
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const started = Date.now();
  const { rows, cache, error } = await loadConversationPairs();
  if (error) {
    const payload: Phase1ConversationsResponse = {
      ok: false,
      total: 0,
      page: 1,
      pageSize: 0,
      totalPages: 0,
      items: [],
      message: error,
    };
    return NextResponse.json(payload, { status: 200 });
  }

  const rawQ = params.get("q") ?? "";
  const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH).toLowerCase();
  const minTurns = parseIntOrUndefined(params.get("minTurns"));
  const maxTurns = parseIntOrUndefined(params.get("maxTurns"));
  const sortParam = params.get("sort") as Phase1ConversationsQuery["sort"] | null;
  const sort: Phase1ConversationsQuery["sort"] =
    sortParam && SORTS.includes(sortParam) ? sortParam : "id";
  const format =
    params.get("format") === "csv" || params.get("format") === "json"
      ? (params.get("format") as "csv" | "json")
      : "json";
  const download = params.get("download") === "1";
  const conversationId = (params.get("conversationId") ?? "").trim().slice(0, 64);

  /* ---- Thread branch: one conversation, every pair, ordered by turn ---- */
  if (conversationId) {
    const thread = rows
      .filter((row) => row.conversation_id === conversationId)
      .sort((a, b) => a.turn - b.turn);
    const threadItems: Phase1ConversationPair[] = thread.map((row) => ({
      conversation_id: row.conversation_id,
      turn: row.turn,
      customer_message: row.customer_message,
      support_response: row.support_response,
      created_at: row.created_at,
    }));
    const threadPayload: Phase1ThreadResponse = {
      ok: true,
      conversationId,
      turns: threadItems.length,
      startedAt: threadItems[0]?.created_at,
      items: threadItems,
      corpusRows: rows.length,
      cache,
      elapsedMs: Date.now() - started,
    };
    return NextResponse.json(threadPayload, { status: 200 });
  }

  let filtered = rows;
  if (minTurns !== undefined) {
    filtered = filtered.filter((row) => row.turn >= minTurns);
  }
  if (maxTurns !== undefined) {
    filtered = filtered.filter((row) => row.turn <= maxTurns);
  }
  if (q) {
    const matches = makeRowMatcher(q);
    filtered = filtered.filter(matches);
  }

  if (sort === "turns_desc") {
    filtered = [...filtered].sort(
      (a, b) => b.turn - a.turn || a.conversation_id.localeCompare(b.conversation_id),
    );
  } else if (sort === "longest") {
    filtered = [...filtered].sort(
      (a, b) =>
        b.customer_message.length - a.customer_message.length ||
        a.conversation_id.localeCompare(b.conversation_id),
    );
  } else if (sort === "relevance" && q) {
    // Rank by term frequency (customer-message hits weigh double); ties keep
    // the deterministic id order so pages remain stable across requests.
    const score = makeRowScorer(q);
    filtered = [...filtered]
      .map((row) => ({ row, s: score(row) }))
      .sort(
        (a, b) => b.s - a.s || a.row.conversation_id.localeCompare(b.row.conversation_id),
      )
      .map((entry) => entry.row);
  }

  /* ---- CSV export branch: stream the filtered rows as a download ---- */
  if (format === "csv") {
    const total = filtered.length;
    const exported = filtered.slice(0, MAX_EXPORT_ROWS);
    const lines: string[] = [
      "conversation_id,turn,created_at,customer_message,support_response",
    ];
    for (const row of exported) {
      lines.push(
        [
          csvField(row.conversation_id),
          csvField(String(row.turn)),
          csvField(row.created_at),
          csvField(row.customer_message),
          csvField(row.support_response),
        ].join(","),
      );
    }
    if (total > exported.length) {
      lines.push(
        csvField(
          `# export truncated: showing first ${exported.length} of ${total} matching rows`,
        ),
      );
    }
    const safeQuery = rawQ.trim().slice(0, MAX_QUERY_LENGTH).replace(/[^\w-]+/g, "_");
    const fileName = `conversation_pairs${safeQuery ? `-${safeQuery}` : ""}.csv`;
    return new NextResponse(`\uFEFF${lines.join("\n")}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(exported.length),
        "X-Export-Total": String(total),
      },
    });
  }

  /* ---- JSON download branch: same rows as the CSV export, as a single
         self-describing JSON document (filters + row metadata included) ---- */
  if (format === "json" && download) {
    const total = filtered.length;
    const exported = filtered.slice(0, MAX_EXPORT_ROWS).map((row) => ({
      conversation_id: row.conversation_id,
      turn: row.turn,
      created_at: row.created_at,
      customer_message: row.customer_message,
      support_response: row.support_response,
    }));
    const safeQuery = rawQ.trim().slice(0, MAX_QUERY_LENGTH).replace(/[^\w-]+/g, "_");
    const fileName = `conversation_pairs${safeQuery ? `-${safeQuery}` : ""}.json`;
    const payload = {
      ok: true,
      export: "phase1-conversation-pairs" as const,
      source: "conversation_pairs.csv (twcs.csv via the Apple Support AI Phase 1 pipeline)",
      filters: {
        q: rawQ.trim().slice(0, MAX_QUERY_LENGTH) || null,
        minTurns: minTurns ?? null,
        maxTurns: maxTurns ?? null,
        sort,
      },
      exportedRows: exported.length,
      totalMatchingRows: total,
      truncated: total > exported.length,
      generatedAt: new Date().toISOString(),
      items: exported,
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(exported.length),
        "X-Export-Total": String(total),
      },
    });
  }

  const pageSize = Math.min(
    Math.max(parseIntOrUndefined(params.get("pageSize")) ?? 8, 1),
    MAX_PAGE_SIZE,
  );
  const total = filtered.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const requestedPage = Math.max(parseIntOrUndefined(params.get("page")) ?? 1, 1);
  const page = Math.min(requestedPage, totalPages);

  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
  // Relevance mode badges each returned pair with its term-frequency score
  // (customer hits ×2 + support hits) so the ranking is self-explaining.
  const relevanceScorer =
    sort === "relevance" && q ? makeRowScorer(q) : undefined;
  const items: Phase1ConversationPair[] = slice.map((row) => ({
    conversation_id: row.conversation_id,
    turn: row.turn,
    customer_message: row.customer_message,
    support_response: row.support_response,
    created_at: row.created_at,
    ...(relevanceScorer ? { score: relevanceScorer(row) } : {}),
  }));

  const payload: Phase1ConversationsResponse = {
    ok: true,
    total,
    page,
    pageSize,
    totalPages,
    items,
    query: { q: rawQ.trim().slice(0, MAX_QUERY_LENGTH) || undefined, minTurns, maxTurns, sort },
    corpusRows: rows.length,
    cache,
    elapsedMs: Date.now() - started,
  };
  return NextResponse.json(payload, { status: 200 });
}
