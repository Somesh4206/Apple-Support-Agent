/**
 * Built-in lexical retrieval engine + intent classifier (the durable fallback
 * path for the Phase 7 agent when the Python ML artifacts are unavailable).
 *
 * Contract: `builtinSearch(query, k)` returns EXACTLY the shape the Python
 * worker returns for its "search" op — { results, query_intent, timings } —
 * so the agent pipeline (gates, Phase 6 policy, grounded LLM generation)
 * runs unchanged whichever backend served the evidence.
 *
 * How it works:
 *   1. INTENT: weighted keyword/phrase scoring over the Phase 2 taxonomy
 *      (same 10 labels as src/intents/taxonomy.py), calibrated so the
 *      confidence lands in a similar range as the logreg head (a strong
 *      multi-keyword hit ≈ 0.85–0.95, ambiguous ≈ 0.4–0.55, nothing ≈
 *      other/0.34). The Phase 6 gates therefore behave the same.
 *   2. RETRIEVAL: IDF-weighted token coverage between the query and each
 *      corpus pair (customer side + support side), plus a bigram continuity
 *      bonus, mapped into a cosine-like 0.05–0.97 score. The 0.65 retrieval
 *      threshold from .env means roughly "≥62% of the query's informative
 *      mass appears in the evidence pair" — the same spirit as the FAISS
 *      cosine gate.
 *
 * The index is built lazily once per process (~1 ms for this corpus size)
 * and is fully in-memory.
 */

import { BUILTIN_CORPUS, type BuiltinPair } from "./builtin_corpus";

export { BUILTIN_CORPUS, BUILTIN_CORPUS_SIZE } from "./builtin_corpus";
export type { BuiltinPair } from "./builtin_corpus";

export type BuiltinSearchResult = {
  results: Array<{
    rank: number;
    score: number;
    pair_id: string;
    conversation_id: string | null;
    turn: number | null;
    customer_message: string;
    support_response: string;
    predicted_intent: string | null;
    predicted_confidence: number | null;
  }>;
  query_intent: {
    label: string;
    confidence: number;
    runner_up: string | null;
    runner_up_confidence: number | null;
  };
  timings: { embed_ms: number; faiss_search_ms: number };
};

/* ------------------------------------------------------------------ */
/* Tokenization                                                        */
/* ------------------------------------------------------------------ */

/**
 * Stopwords for lexical matching — superset of the reply-scoring list in
 * index.ts (that one stays untouched); here we also drop empty fillers
 * ("made", "getting", "keep"…) that carry no topical signal.
 */
const STOPWORDS = new Set(
  "the a an and or but if then so to of in on at for with from by as is are was were be been being am do does did doing done have has had having will would can could should may might must shall i you he she it we they me him her us them my your his its our their this that these those there here what which who whom when where why how all any both each few more most other some such no nor not only own same than too very just also again once about above below between into through during before after up down out off over under further while because until against please thanks thank hi hey hello sorry let lets get got getting want wants need needs like know see look back still really much many every made make makes maybe kinda sort kinda im ive id youre cant wont doesnt dont didnt isnt arent wasnt werent".split(
    " ",
  ),
);

/** Normalize contractions so "won't" and "wont" match: tokens are plain words. */
function rawTokens(text: string): string[] {
  const normalized = text.toLowerCase().replace(/['’`]/g, "");
  return normalized.match(/[a-z0-9]+/g) ?? [];
}

function contentTokens(text: string): string[] {
  return rawTokens(text).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/* ------------------------------------------------------------------ */
/* Intent classification (keyword/phrase scoring over the taxonomy)     */
/* ------------------------------------------------------------------ */

/**
 * [phrase, weight] per intent. Phrases are matched as consecutive word
 * sequences on the raw (non-stopword-filtered) token stream, so multi-word
 * signals like "wont turn on" or "genius bar" survive. Weights mirror the
 * taxonomy's signal lists plus high-precision variants.
 */
const INTENT_KEYWORDS: Record<string, Array<[string[], number]>> = {
  software_bug: [
    [["update"], 3], [["ios"], 2], [["macos"], 2], [["bug"], 4], [["glitch"], 4],
    [["crash"], 4], [["crashes"], 4], [["crashing"], 4], [["crashed"], 3],
    [["freeze"], 3], [["freezes"], 3], [["frozen"], 3], [["froze"], 3],
    [["stuck"], 2], [["slow"], 2], [["lags"], 2], [["lagging"], 2], [["lag"], 2],
    [["app"], 2], [["apps"], 2], [["restart"], 1], [["reboot"], 1],
    [["keyboard"], 2], [["notifications"], 2], [["imessage"], 2], [["imessages"], 2],
    [["facetime"], 2], [["mail"], 2], [["siri"], 2], [["software"], 3],
    [["autocorrect"], 3], [["voicemail"], 2], [["widget"], 2], [["widgets"], 2],
    [["wifi"], 1], [["bluetooth"], 1], [["typing"], 2], [["flashlight"], 2],
    [["battery", "drain"], 3], [["battery", "life"], 2],
  ],
  device_hardware: [
    [["battery"], 3], [["batteries"], 3], [["screen"], 2], [["button"], 3],
    [["buttons"], 3], [["charge"], 2], [["charges"], 2], [["charger"], 3],
    [["chargers"], 3], [["charging"], 2], [["dead"], 3], [["water"], 4],
    [["wet"], 4], [["crack"], 4], [["cracked"], 4], [["scratch"], 3],
    [["scratched"], 3], [["broke"], 3], [["broken"], 3], [["camera"], 3],
    [["speaker"], 3], [["mic"], 2], [["microphone"], 3], [["sound"], 1],
    [["drop"], 2], [["dropped"], 2], [["hardware"], 4], [["headphone"], 2],
    [["headphones"], 2], [["vibrate"], 2], [["vibrates"], 2], [["vibrating"], 2],
    [["overheat"], 3], [["overheats"], 3], [["overheating"], 3],
    [["port"], 2], [["cable"], 2], [["airpod"], 2], [["airpods"], 2],
    [["watch"], 1], [["macbook"], 2], [["volume"], 2], [["touch", "id"], 4],
    [["wont", "turn", "on"], 5], [["turn", "on"], 1], [["wont", "start"], 4],
    [["wont", "charge"], 4], [["shut", "down"], 2], [["shuts", "down"], 2],
    [["black", "screen"], 4], [["home", "button"], 4], [["side", "button"], 3],
    [["lock", "button"], 3], [["apple", "watch"], 2],
  ],
  account_icloud: [
    [["apple", "id"], 6], [["password"], 5], [["sign", "in"], 4], [["signin"], 3],
    [["login"], 3], [["log", "in"], 3], [["icloud"], 5], [["backup"], 3],
    [["backups"], 3], [["sync"], 2], [["syncing"], 2], [["synced"], 2],
    [["storage"], 2], [["verification"], 4], [["verify"], 2], [["code"], 1],
    [["2fa"], 4], [["account"], 3], [["accounts"], 3], [["activation"], 3],
    [["contacts"], 2], [["restore"], 3], [["find", "my"], 2],
    [["forgot", "my", "password"], 6], [["reset", "my", "password"], 6],
    [["sign", "out"], 3], [["locked"], 3], [["disabled"], 3],
    [["trusted"], 2], [["photo", "library"], 2], [["family", "sharing"], 2],
  ],
  connectivity: [
    [["wifi"], 6], [["wi", "fi"], 6], [["bluetooth"], 5], [["signal"], 4],
    [["cellular"], 4], [["network"], 3], [["internet"], 3], [["hotspot"], 4],
    [["airdrop"], 4], [["sim"], 5], [["carplay"], 4], [["vpn"], 4], [["dns"], 4],
    [["no", "service"], 5], [["sim", "card"], 5], [["wifi", "calling"], 5],
    [["connect"], 2], [["connects"], 2], [["connecting"], 2],
    [["disconnect"], 3], [["disconnects"], 3], [["disconnecting"], 3],
    [["disconnected"], 3], [["dropping"], 2], [["drops"], 1],
    [["pair"], 2], [["pairing"], 3], [["coverage"], 3], [["bars"], 2],
  ],
  billing_purchases: [
    [["refund"], 6], [["refunds"], 6], [["charge"], 5], [["charged"], 5],
    [["charges"], 5], [["bill"], 5], [["billed"], 5], [["billing"], 6],
    [["invoice"], 4], [["money"], 3], [["purchase"], 5], [["purchased"], 5],
    [["bought"], 4], [["subscription"], 5], [["subscriptions"], 5],
    [["trial"], 4], [["order"], 4], [["orders"], 4], [["delivery"], 3],
    [["deliver"], 3], [["shipping"], 3], [["card"], 2], [["gift", "card"], 4],
    [["payment"], 4], [["paid"], 4], [["pay"], 3], [["double", "charge"], 6],
    [["charged", "twice"], 6], [["in", "app"], 4], [["renew"], 3],
    [["apple", "music", "subscription"], 5],
  ],
  repair_warranty: [
    [["warranty"], 6], [["repair"], 6], [["repairs"], 6], [["replace"], 5],
    [["replacement"], 4], [["genius", "bar"], 6], [["applecare"], 6],
    [["service"], 2], [["appointment"], 3], [["screen", "replacement"], 6],
    [["out", "of", "warranty"], 6], [["mail", "in"], 3], [["repairable"], 5],
    [["battery", "replacement"], 6], [["screen", "repair"], 6],
    [["service", "options"], 3],
  ],
  security_privacy: [
    [["phishing"], 8], [["scam"], 7], [["scammed"], 7], [["hack"], 6],
    [["hacked"], 7], [["hacker"], 7], [["stolen"], 7], [["compromised"], 7],
    [["suspicious"], 5], [["fake"], 4], [["spam"], 4], [["privacy"], 5],
    [["security"], 4], [["took", "over"], 6], [["identity"], 2],
    [["account", "locked"], 4], [["locked", "out"], 3],
  ],
  general_complaint: [
    [["disappointed"], 4], [["worst"], 4], [["useless"], 3], [["ridiculous"], 3],
    [["done", "with"], 4], [["switching", "to"], 4], [["downhill"], 4],
    [["fix", "it"], 2], [["fed", "up"], 4], [["angry"], 3], [["terrible"], 4],
    [["awful"], 4], [["hate"], 3], [["never", "again"], 4], [["so", "bad"], 2],
    [["ruined"], 3], [["killed"], 2], [["quality"], 1], [["frustrating"], 2],
  ],
  support_process: [
    [["speak", "to"], 5], [["actual", "person"], 6], [["human"], 4],
    [["customer", "support"], 4], [["support", "team"], 4], [["automated"], 4],
    [["call", "me"], 3], [["phone", "number"], 3], [["chat"], 2],
    [["dms"], 4], [["dm", "me"], 4], [["no", "one", "answers"], 6],
    [["no", "reply"], 4], [["help", "page"], 3], [["advisor"], 3],
    [["real", "person"], 6], [["talk", "to", "someone"], 6],
    [["someone", "from"], 3], [["wait", "time"], 3], [["on", "hold"], 3],
  ],
};

/** Intent labels in taxonomy order (kept in sync with taxonomy.py). */
const INTENT_LABELS = [
  "software_bug",
  "device_hardware",
  "account_icloud",
  "connectivity",
  "billing_purchases",
  "repair_warranty",
  "security_privacy",
  "general_complaint",
  "support_process",
  "other",
];

function phraseIn(tokens: string[], phrase: string[]): boolean {
  const n = phrase.length;
  if (n === 0 || tokens.length < n) return false;
  for (let i = 0; i + n <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (tokens[i + j] !== phrase[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Predict the intent of a customer message. Calibration targets:
 *   - strong single-domain signal      → 0.85–0.95
 *   - weak/ambiguous                   → 0.40–0.60  (fails the 0.6 gate)
 *   - no signal at all                 → other / 0.34
 */
export function classifyIntent(message: string): {
  label: string;
  confidence: number;
  runner_up: string | null;
  runner_up_confidence: number | null;
} {
  const tokens = rawTokens(message);
  const scores: Array<{ label: string; score: number }> = [];
  for (const label of INTENT_LABELS) {
    if (label === "other") continue;
    const keywords = INTENT_KEYWORDS[label] ?? [];
    let score = 0;
    for (const [phrase, weight] of keywords) {
      if (phraseIn(tokens, phrase)) score += weight;
    }
    scores.push({ label, score });
  }
  scores.sort((a, b) => b.score - a.score);

  const top = scores[0];
  if (!top || top.score <= 0) {
    return {
      label: "other",
      confidence: 0.34,
      runner_up: null,
      runner_up_confidence: null,
    };
  }
  const second = scores[1];
  const strength = Math.min(0.5, 0.07 * top.score);
  const margin = second && second.score > 0 ? (top.score - second.score) / top.score : 1;
  const confidence = Math.min(0.95, Math.max(0.4, 0.42 + strength + 0.22 * margin));
  return {
    label: top.label,
    confidence: Math.round(confidence * 10000) / 10000,
    runner_up: second && second.score > 0 ? second.label : null,
    runner_up_confidence:
      second && second.score > 0
        ? Math.round(Math.min(0.9, 0.42 + Math.min(0.5, 0.07 * second.score)) * 10000) / 10000
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Lexical retrieval (IDF-weighted coverage + bigram bonus)            */
/* ------------------------------------------------------------------ */

type IndexedPair = {
  pair: BuiltinPair;
  tokens: Set<string>;
  tokenTf: Map<string, number>;
  bigrams: Set<string>;
  norm: number;
};

let indexCache: IndexedPair[] | null = null;
let idfCache: Map<string, number> | null = null;

function buildIndex(): void {
  if (indexCache) return;
  const df = new Map<string, number>();
  const pairs: IndexedPair[] = BUILTIN_CORPUS.map((pair) => {
    const text = `${pair.customer_message} ${pair.support_response}`;
    const ct = contentTokens(text);
    const tokens = new Set(ct);
    const tokenTf = new Map<string, number>();
    for (const t of ct) tokenTf.set(t, (tokenTf.get(t) ?? 0) + 1);
    const raw = rawTokens(text);
    const bigrams = new Set<string>();
    for (let i = 0; i + 1 < raw.length; i++) {
      if (!STOPWORDS.has(raw[i]) && !STOPWORDS.has(raw[i + 1])) {
        bigrams.add(`${raw[i]} ${raw[i + 1]}`);
      }
    }
    for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
    return { pair, tokens, tokenTf, bigrams, norm: Math.sqrt(tokens.size) };
  });
  const N = pairs.length || 1;
  idfCache = new Map(
    [...df.entries()].map(([t, d]) => [t, Math.log(1 + (N - d + 0.5) / (d + 0.5))]),
  );
  indexCache = pairs;
}

/**
 * Score one query against the corpus, returning the top-K pairs with
 * cosine-like scores in [0.05, 0.97] (calibrated to the FAISS cosine gate:
 * 0.65 ≈ the query's informative mass is ~62% covered by the pair).
 */
export function builtinSearch(query: string, k: number): BuiltinSearchResult {
  const tIntent = performance.now();
  buildIndex();
  const intent = classifyIntent(query);
  const embedMs = Math.max(0.1, Math.round((performance.now() - tIntent) * 100) / 100);

  const tSearch = performance.now();
  const qTokens = contentTokens(query);
  const qBigrams = new Set<string>();
  const qRaw = rawTokens(query);
  for (let i = 0; i + 1 < qRaw.length; i++) {
    if (!STOPWORDS.has(qRaw[i]) && !STOPWORDS.has(qRaw[i + 1])) {
      qBigrams.add(`${qRaw[i]} ${qRaw[i + 1]}`);
    }
  }

  const idf = idfCache!;
  const idfMass = [...new Set(qTokens)].reduce((sum, t) => sum + (idf.get(t) ?? 1.7), 0);

  const scored = (indexCache ?? []).map((doc) => {
    let coveredMass = 0;
    for (const t of new Set(qTokens)) {
      if (doc.tokens.has(t)) coveredMass += idf.get(t) ?? 1.7;
    }
    const coverage = idfMass > 0 ? coveredMass / idfMass : 0;
    let bigramHits = 0;
    for (const b of qBigrams) if (doc.bigrams.has(b)) bigramHits++;
    const bigramBonus = qBigrams.size > 0 ? Math.min(0.12, 0.04 * bigramHits) : 0;
    // Long customer-side matches are the strongest grounding signal —
    // reward when the coverage happens in the customer message itself.
    let customerCoverage = 0;
    const cTokens = new Set(contentTokens(doc.pair.customer_message));
    const cMass = [...new Set(qTokens)].reduce(
      (sum, t) => sum + (cTokens.has(t) ? (idf.get(t) ?? 1.7) : 0),
      0,
    );
    if (idfMass > 0) customerCoverage = cMass / idfMass;
    const customerBonus = customerCoverage >= 0.5 ? 0.04 : 0;

    const score = Math.min(
      0.97,
      Math.max(0.05, 0.22 + 0.7 * coverage + bigramBonus + customerBonus),
    );
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, Math.max(1, Math.min(10, k))).map((s, i) => ({
    rank: i + 1,
    score: Math.round(s.score * 10000) / 10000,
    pair_id: s.doc.pair.id,
    conversation_id: s.doc.pair.conversation_id,
    turn: s.doc.pair.turn,
    customer_message: s.doc.pair.customer_message,
    support_response: s.doc.pair.support_response,
    predicted_intent: s.doc.pair.predicted_intent,
    predicted_confidence: s.doc.pair.predicted_confidence,
  }));
  const searchMs = Math.max(0.1, Math.round((performance.now() - tSearch) * 100) / 100);

  return {
    results,
    query_intent: intent,
    timings: { embed_ms: embedMs, faiss_search_ms: searchMs },
  };
}
