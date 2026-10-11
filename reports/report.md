# Apple Support AI — Technical Report

**Evidence-Grounded Customer Support Agent** · technical assignment for Hiver

> **Status: Phases 1–9 complete — all assignment phases delivered and
> measured.** This report contains only metrics that were actually computed
> by executed code — every number below comes from `pipeline_run.json` /
> `eda_summary.json` (full-scale run on the real Kaggle `twcs.csv`, 2026-09-10,
> 211.8 s, 7/7 validations passed), `evaluation/results/baseline_results.json`
> (Phase 2, seed 42, 2026-09-11), `evaluation/results/embedding_results.json`
> (Phase 3, seed 42, 2026-09-11), `evaluation/results/retrieval_results.json`
> (Phase 4, seed 42, 2026-09-12), `evaluation/results/generation_results.json`
> (Phase 5, 2026-09-12), `evaluation/results/escalation_results.json` +
> `evaluation/escalation_labels.json` (Phase 6, 2026-09-16) and
> `evaluation/results/agent_results.json` (Phase 7, 2026-09-16).

---

## 1. Executive Summary

Phase 1 delivers the data foundation for an evidence-grounded AppleSupport
agent: the Customer Support on Twitter corpus (2,811,774 tweets) is loaded and
validated, AppleSupport conversations are isolated via a *configurable*
account id (discovered from data, never hard-coded), conversations are
reconstructed from reply links, and 106,137 customer↔support evidence pairs
are extracted with conversation identity preserved for leakage-free splitting.
Exploratory analysis (notebook + dashboard) profiles the corpus and yields a
provisional topic distribution that anchored the Phase 2 intent taxonomy.
All outputs passed a 7-point structural validation gate.

**Phase 2 adds the classification foundation:** a 10-class intent taxonomy
derived from the EDA distribution (plus three classes grounded in a manual
reading of the unmatched pool), a 200-example **manually labelled golden set**
(uniform sample of customer-initiated openers, seed 42, conversation-level
stratified 70/15/15 split, isolation manifest for Phase 4), and three measured
baselines. The honest headline: with 200 labelled examples, **no learned
TF-IDF configuration beats the majority baseline on test accuracy**
(0.621 vs 0.655) while transparent keyword rules win macro-F1 (0.391 vs
0.079) — the measured motivation for the Phase 3 embedding classifier.

**Phase 3 delivers that classifier and confirms the diagnosis:** a frozen
`all-MiniLM-L6-v2` sentence encoder (384-d, trained on an external public
corpus — no golden-set leakage) with two heads evaluated under the *same*
protocol on the *same* test split. The learned LogReg head lifts test
macro-F1 **0.078 → 0.303** (≈3.9×) at accuracy 0.655 (ties majority) and
the best weighted-F1 of all five models (0.659); a zero-hyperparameter
centroid classifier reaches macro-F1 0.389 — matching the keyword rules'
0.391 at +17 points accuracy. Confidence is informative (0.780 mean on
correct vs 0.508 on wrong test predictions), which is the signal the Phase 6
escalation policy will threshold.

**Phase 4 turns the corpus into a working retrieval layer:** a FAISS
`IndexFlatIP` (exact cosine) over **105,871 golden-isolated evidence pairs**
(embedded with the same frozen encoder) answers the golden-test openers with
**Recall@1/3/5 = 0.586/0.655/0.759** (MRR@5 0.651) under an explicitly
documented relevance definition (D19). Two secondary findings are measured,
not asserted: majority-voting the top-5 retrieved labels classifies the same
openers at **0.690 accuracy — above the Phase 3 trained head (0.655)**, and
the configured `RETRIEVAL_THRESHOLD=0.65` gates 79.3% of test openers with
Recall@5 0.826 among them — the grounding gate for Phases 5–6. A live search
service serves the index to the dashboard demo at ~80 ms/query.

**Phase 5 closes the loop with grounded generation:** for each golden-test
opener, the predicted intent + confidence (Phase 3 head), the top-5 similar
historical pairs (Phase 4 index) and an explicit evidence-quality line are
assembled into one prompt under **six non-negotiable safety rules**
(assignment §16), and a backend-only LLM (glm-4-plus via z-ai-web-dev-sdk)
drafts a single Twitter-length reply. Measured on the same 29 openers with
transparent lexical heuristics — no LLM-as-judge, no human annotation: all
**29/29 generations succeeded** with **zero unsupported specifics** (no
numbers, versions, prices or URLs that do not appear in the evidence),
**100% safety-framing compliance** (each reply states its
“based on similar cases” basis), and **13/13 escalation consistency** (every
reply whose Phase 6 gates fail asks a clarifying question or redirects to
DMs instead of guessing). Lexical grounding overlap averages **0.47** —
honestly reported as a proxy, not a semantic guarantee. The generation runs
as a live endpoint of the retrieval service (~0.6 s/reply) and powers an
interactive dashboard demo.

**Phase 6 makes auto-vs-escalate a measured, explainable decision:** a
five-rule policy (private-state domains, unmatched intent, sensitive
content, and the two numeric gates fixed since Phases 3/4) evaluated against
human ground-truth labels on the same 29 test openers — **false-auto rate
0/10** (exact CI95 [0.000, 0.309]), **recall 1.000**, precision 0.714, at an
honest **21% over-escalation cost** (all four cases are low-confidence G1
fires, fully documented). The ablation shows the domain rules catch the one
gate-passing case the numeric gates cannot (an account sign-in loop).

**Phase 7 composes everything into one agent:** Phase 3 head → Phase 4
retrieval → Phase 6 policy → Phase 5 generation *only when auto-handled*.
Escalated messages never reach the LLM (48.3% of test calls skipped,
28 ms end-to-end vs 735 ms for auto-handles) and human reviewers receive a
structured handoff instead. The live service's TypeScript policy mirror is
**asserted consistent with the Python policy (29/29)**. **Phase 8** exposes
the same agent in the assignment's Streamlit app (a thin client — one code
path, AppTest-verified), and **Phase 9** is this report.

**Headline numbers (real run):** 80,966 AppleSupport conversations · 237,745
corpus tweets · 106,137 support pairs · avg 2.94 turns/conversation · avg
100.8 chars/message · provisional top topics: Software/Apps 29.0%,
Device/Hardware 14.1%, Connectivity 2.8% · multi-topic messages 9.9%.

## 2. Problem Definition

Build a support agent that, given a customer message, can
(1) classify the issue, (2) retrieve historically similar AppleSupport cases,
(3) generate a response *grounded* in those cases, (4) decide auto-handle vs
escalate, and (5) quantitatively evaluate every component. The assignment is
phased; Phase 1 covers the data layer: loading, AppleSupport filtering,
conversation reconstruction and EDA. Later phases depend on this foundation:
the pairs built here are the Phase 4 retrieval corpus; the `conversation_id`
column is the Phase 2 leakage-prevention key.

## 3. Dataset

**Source:** Kaggle `thoughtvector/customer-support-on-twitter` (`twcs.csv`,
516,508,641 bytes, not committed — see `data/README.md`).

**Schema (7 columns, validated on load):** `tweet_id`, `author_id`,
`inbound`, `created_at`, `text`, `response_tweet_id`,
`in_response_to_tweet_id`. All identifiers parsed as strings (18–19-digit ids
lose precision as numbers). `inbound=TRUE` marks customer→brand tweets;
outbound `author_id`s are account screen names.

**Full-corpus scan (single chunked pass):**

| measure | value |
|---|---|
| total tweets | 2,811,774 |
| unique tweet ids | 2,811,774 (0 duplicates) |
| inbound / outbound | 1,537,843 / 1,273,931 |
| conversation starters (tweets with no parent) | 794,335 |
| malformed inbound flags | 0 |
| top outbound authors | AmazonHelp 169,840 · **AppleSupport 106,860** · Uber_Support 56,270 · SpotifyCares 43,265 · Delta 42,253 |

**AppleSupport identification:** `APPLE_SUPPORT_AUTHOR_ID` is configuration;
`scripts/find_author_ids.py` derives candidates from the data itself (the
table above is its output). The configured value `AppleSupport` was verified
against this ranking — nothing was guessed.

**Historical-data disclaimer:** the corpus contains *historical* support
interactions. AppleSupport replies are evidence for retrieval/evaluation,
not a representation of current Apple policy. Observed timestamps in the
filtered corpus span 2013–2017 (min is an outlier; the bulk of threads are
late 2017).

## 4. Data Processing

**Collection (memory-safe):** full-scale runs use an AppleSupport-first
chunked closure (decision D8): pass 1 records all 106,860 AppleSupport tweets;
subsequent passes expand to parents/children until (near-)fixpoint. Canonical
run: 12 passes, 238,754 tweets collected, residual non-convergence +41 tweets
(0.017%, ultra-deep threads only; pairs unaffected). Peak memory stays in the
hundreds of MB on a 4 GB machine.

**Cleaning (conservative, decision D6):** over 238,754 collected rows —
HTML entities decoded 10,426 · URLs removed 99,269 · leading @mentions
stripped 187,230 · whitespace collapsed 19,765 · RT prefixes removed 2 ·
rows dropped 787 (empty text after cleaning; 0 missing ids; 0 duplicate ids).
Typos, casing and punctuation preserved by design.

**Conversation reconstruction:** reply trees built from parent links
(authoritative; 0 parent-link mismatches vs 14,005 dangling `response_tweet_id`
references, which are reported as noise). Missing-parent tweets become
*partial roots* (913) so subset runs never merge unrelated threads; 0 cyclic
tweets encountered in this run (guard exists and is tested by the synthetic
smoke sample). Result: 81,156 conversations, of which **80,966 involve
AppleSupport** (237,745 tweets).

**Evidence pairs:** every AppleSupport reply paired with the inbound customer
tweet it answers, keeping `conversation_id`, both tweet ids and timestamps →
**106,137 pairs**.

**Validation gate (executed, 7/7 PASS):** pair endpoints exist in the tweet
frame; pairs map to reconstructed conversations; pair texts non-empty; each
support reply used at most once; all responses authored by the configured
account; conversation ids unique; every tweet attached to a conversation.

## 5. Intent Taxonomy

**Status: FINAL (Phase 2).** The taxonomy is defined in
`src/intents/taxonomy.py` — the single source of truth consumed by the
golden-set builder, the baseline trainer, the dashboard and (unchanged) the
Phase 3 classifier. It is justified against the Phase 1 EDA distribution
(`eda_summary.json` provisional topics, word-boundary matching) and a manual
reading of randomly sampled openers:

| final class | EDA anchor | golden support | typically escalated |
|---|---|---|---|
| `software_bug` | Software / Apps 29.0% | 128 | no |
| `device_hardware` | Device / Hardware 14.1% | 11 | no |
| `account_icloud` | Account/Apple ID 2.2% + iCloud 1.7% (merged) | 9 | no |
| `connectivity` | Connectivity 2.8% | 9 | no |
| `billing_purchases` | Billing 2.4% + Refunds 1.5% + Orders 1.0% + Subscriptions 0.4% (merged) | 5 | **yes** |
| `repair_warranty` | Repair / Warranty 1.9% | 6 | **yes** |
| `security_privacy` | Security / Privacy 0.6% | 2 | **yes** |
| `general_complaint` | from the unmatched pool (reading) | 9 | no |
| `support_process` | from the unmatched pool (reading) | 6 | **yes** |
| `other` | unmatched remainder | 15 | **yes** |

Design rules (decision D13): every EDA topic ≥~2% share earns a class;
sub-2.5% topics sharing a routing profile are merged so the merged class can
reach usable golden support; the 53% unmatched pool is split by observed
behaviour — pure venting (`general_complaint`), meta-complaints about
reaching support (`support_process` — the natural escalation trigger), and
the remainder (`other`). Multi-topic messages remain 9.9% of the corpus —
empirical support for the assignment's `secondary_intents` / `multi_issue`
output design, deferred to the Phase 3 classifier head.

**Corpus period note:** 99.5% of the 80,244 customer-initiated openers fall
in Sep–Dec 2017 (the iOS 11 rollout window of the corpus). The golden set —
like the corpus — is dominated by iOS 11 era complaints; all Phase 2 metrics
measure this historical window, not a balanced topic mix.

## 6. Golden Set & Baselines — *measured (Phase 2)*

**Golden set** (`evaluation/golden_set.csv`): 200 examples drawn uniformly
(no rare-class boosting — the golden set must estimate performance on the
*natural* distribution; rare-class scarcity is a documented limitation, not a
sampling bug) from the 80,244 customer-initiated conversation openers, seed
42. Every message was read and labelled **manually** by meaning; the
labelling worksheet intentionally shows no keyword hints to avoid biasing
labels. An automated gate validates: every row labelled exactly once, labels
restricted to taxonomy classes, no unknown ids (build exits non-zero on
failure). Split: conversation-level, stratified by label, 70/15/15 →
**142 / 29 / 29**. A manifest (`golden_conversation_ids.json`) reserves all
200 conversation ids so Phase 4 retrieval never indexes golden evidence.

**Baselines (test split, 29 examples, seed 42):**

| baseline | accuracy | macro-F1 | weighted-F1 |
|---|---|---|---|
| keyword rules (Phase 1 EDA topics → labels) | 0.4828 | **0.3906** | 0.5298 |
| majority (`software_bug`) | **0.6552** | 0.0792 | 0.5187 |
| TF-IDF + LogReg | 0.6207 | 0.0783 | 0.5127 |

TF-IDF + LogReg details: word 1–2 grams, English stopwords, sublinear tf;
hyperparameters (C=10.0, class_weight=balanced, min_df=1) selected by 5-fold
CV **on the train split** with criterion mean(accuracy, macro-F1) — tuning
on the 29-example validation split proved too noisy (a val-selected config
scored 0.412 val macro-F1 but 0.104 test macro-F1; recorded in
`baseline_results.json`). Train accuracy 1.0 (the 142-example train split is
memorisable); CV-on-train macro-F1 0.16 ± 0.08.

**Failure analysis of the learned baseline (measured, not asserted):** the
confusion matrix shows 25 of 29 test messages predicted `software_bug` (18
correct). Every rare-class test example (device_hardware 2, account_icloud 1,
connectivity 1, billing 1, repair 1, general_complaint 1, support_process 1,
other 2) was misclassified — mostly into `software_bug`. Keyword rules, by
contrast, perfectly classified the rare classes present in test
(account_icloud, connectivity, billing: P=R=F1=1.0 each) but recall only 47%
of `software_bug`. **Conclusion:** at n=200, learning generalises badly on
short noisy tweets; semantics-aware embeddings (Phase 3) or a hybrid
keywords+learned router are the measured next steps. The val split is
retained as a held-out sanity check and test was untouched until final
evaluation.

Reproduce:

```bash
python scripts/build_golden_set.py sample --n 200   # deterministic worksheet
# (label evaluation/labeling_worksheet.jsonl → evaluation/golden_labels.json)
python scripts/build_golden_set.py build            # validate + split + manifest
python scripts/train_baselines.py                  # metrics → evaluation/results/
```

## 7. Main Classifier — *measured (Phase 3)*

Embedding-based intent classifier: frozen `all-MiniLM-L6-v2` sentence
encoder (384-d, 22.3M parameters, CPU float32, ~17 s to embed the entire
golden set) + two heads, both fit on the train split only, evaluated with
the **identical protocol as Phase 2** (hyperparameters by 5-fold CV on
train with criterion mean(accuracy, macro-F1); val = sanity check; test
untouched until final evaluation) so the comparison isolates the feature
representation, not the tuning protocol.

**Test-split results (29 examples, seed 42, same rows as Phase 2):**

| model | accuracy | macro-F1 | weighted-F1 |
|---|---|---|---|
| keyword rules | 0.4828 | 0.3906 | 0.5298 |
| majority | **0.6552** | 0.0792 | 0.5187 |
| TF-IDF + LogReg | 0.6207 | 0.0783 | 0.5127 |
| **MiniLM + LogReg head** (C=100, balanced) | **0.6552** | 0.3032 | **0.6586** |
| **MiniLM + centroids** (zero hyperparams) | 0.5517 | **0.3894** | 0.6029 |

Read honestly: embeddings **fix the class collapse, not the accuracy
ceiling**. The LogReg head predicts 7 distinct classes (vs 2 for TF-IDF:
25 of 29 predictions were `software_bug`) and lifts macro-F1 ≈3.9× while
tying majority accuracy; the centroid head has the best macro-F1 of all
learned models without a single hyperparameter. Train accuracy is 1.0
(142 examples remain memorisable); CV-on-train macro-F1 of the selected
configuration is 0.4288, selected over an 8-config grid. Rare-class over-sampling was *measured*, not
assumed: `class_weight="balanced"` (the linear-head equivalent of
duplicating rare examples) improved CV macro-F1 0.3495 → 0.4288 and was
selected by the criterion.

**Confidence surface (Phase 6 input, measured on test):** mean confidence
0.7801 on correct vs 0.5079 on wrong predictions; at the configured
threshold 0.60, 65.5% of test predictions would be auto-handled with
84.2% accuracy among them. Caveat: n=29, indicative only. The 10 test
errors (with per-example confidence and runner-up labels) are recorded in
`embedding_results.json` — including a sarcasm case misclassified *with
0.889 confidence*, an honest warning against confidence-only escalation.

Reproduce:

```bash
pip install -r requirements.txt              # adds sentence-transformers
python scripts/train_embedding_classifier.py # metrics + model artifacts
```

Artifacts: `evaluation/results/embedding_results.json` (full),
`phase3_summary.json` (dashboard), `models/embedding_logreg_head.joblib` +
`models/embedding_prototype.joblib` (reusable heads with confidence),
`models/embedding_cache/` (deterministic golden-set embeddings).

## 8. Retrieval System — *executed, Phase 4*

FAISS retrieval over the historical evidence corpus, with Recall@K
evaluation on the golden-set openers. Every number below is measured;
the full detail (per-query top-5 with scores and snippets) is in
`evaluation/results/retrieval_results.json`, the dashboard summary in
`phase4_summary.json`.

**Corpus & index.** The Phase 1 evidence pairs (`conversation_pairs.csv`,
106,137 rows) minus every pair belonging to the 200 golden conversations
(266 pairs — a conversation yields 1.33 pairs on average): **105,871
indexed pairs**. Coverage is asserted both ways: every manifest
conversation is present in the pairs corpus, and nothing indexed belongs
to a golden conversation, so a golden opener can never retrieve its own
conversation. Customer messages are embedded with the same frozen
`all-MiniLM-L6-v2` encoder as Phase 3 (single configuration point),
L2-normalised, and indexed with `faiss.IndexFlatIP` — exact cosine
similarity, 155.1 MB, sub-millisecond per query, no approximate-index
knobs to tune or document (D20). A structural self-retrieval check
(corpus vector → itself at rank 1, score 1.0000) passes.

**Relevance for Recall@K (D19).** The corpus is unlabeled, so retrieved
pairs are labelled by the Phase 3 `logreg_head` (test accuracy 0.6552,
macro-F1 0.3032 — its noise is part of the measurement and is reported,
not hidden). A hit at rank ≤ k is a retrieved pair whose predicted label
equals the opener's golden label.

**Measured results (golden openers, k=5).**

| metric | VAL (n=29) | TEST (n=29) |
|---|---|---|
| Recall@1 | 0.7241 | **0.5862** |
| Recall@3 | 0.7931 | **0.6552** |
| Recall@5 | 0.9655 | **0.7586** |
| MRR@5 | 0.7908 | **0.6515** |
| top-1 cosine (mean) | 0.7982 | 0.7503 |

Secondary views, both measured: retrieval as a classifier (majority vote
of the top-5 predicted labels) reaches **0.6897** test accuracy — slightly
*above* the Phase 3 trained head (0.6552) on the same openers, an honest
finding that the 106k-pair evidence pool is a strong kNN signal at this
golden-set size. At the configured `RETRIEVAL_THRESHOLD=0.65`, 23/29 test
openers (79.3%) have a top-1 cosine above threshold, and Recall@5 among
them is 0.8261 — the grounding gate Phase 5/6 will consume. Five
qualitative examples (3 hits + 2 honest no-hits) are in the dashboard
summary.

**Live retrieval.** `models/retrieval_corpus.jsonl.gz` + the saved index
power a live search service (Bun + Python worker, port 3030) that the
dashboard's "try it" demo queries in real time — first query ~15 s warm-up
(model + index + corpus), then ~80 ms per search (39 ms embed + 14 ms
FAISS measured).

Reproduce:

```bash
pip install -r requirements.txt              # adds faiss-cpu
python scripts/build_retrieval_index.py      # index + Recall@K + artifacts
```

Artifacts: `models/retrieval_index.faiss` (+ `.json` id-mapping sidecar),
`models/retrieval_corpus.jsonl.gz` (self-contained live-service corpus
with predicted intents), `models/embedding_cache/retrieval_corpus_c*.npz`
(restartable 5k-text embed chunks),
`evaluation/results/{retrieval_results,phase4_summary}.json`.

## 9. Response Generation — *executed, Phase 5*

For each of the 29 golden TEST openers (the same evaluation set as Phases 3
and 4), the live generation service (an endpoint of the Phase 4 mini-service)
assembles one grounded prompt and calls the backend-only z-ai LLM
(glm-4-plus via z-ai-web-dev-sdk):

1. **Inputs consumed from prior phases:** predicted intent + confidence from
   the Phase 3 logreg head; top-K=5 similar pairs from the Phase 4 exact-cosine
   FAISS index, each with its cosine score and precomputed predicted intent.
2. **Prompt:** a fixed system prompt with six non-negotiable safety rules
   (grounding-only facts; explicit historical-case framing; clarifying
   question instead of guessing on weak evidence; DM redirect for
   account/payment/security; concise evidence-matched style; ≤280 chars), plus
   a user prompt carrying the customer message, the intent/confidence with
   runner-up, an explicit evidence-quality line (top-1 cosine vs
   `RETRIEVAL_THRESHOLD=0.65` — “strong/weak grounding”), and the K historical
   pairs. Thresholds are read from the project `.env` (single source of
   truth with `src/config.py`).
3. **Gates (Phase 6 preview, computed per reply):** intent pass
   (confidence ≥ 0.60), retrieval pass (top-1 cosine ≥ 0.65), and the
   conjunction (auto-handle eligible).
4. **Reply scoring — transparent heuristics only, no LLM-as-judge:**
   lexical grounding overlap (share of the reply's content tokens present in
   the evidence pairs), unsupported specifics (numbers / version-like tokens
   / prices / URLs in the reply that appear nowhere in the evidence), safety
   framing compliance, clarifying-question and DM-redirect presence,
   personal-data solicitation, and length vs the corpus style. The same
   scoring code runs in the live service and in the offline evaluation, so
   the dashboard demo shows exactly what was measured.

**Measured results (test, 29 openers, recorded run):**

| metric | value |
|---|---|
| generations succeeded | 29/29 (100%) |
| grounding token overlap | mean 0.474 · median 0.500 · min 0.182 · max 0.700 |
| unsupported specifics | 0 violations across all replies (29/29 clean) |
| safety-framing compliance | 29/29 (100%) |
| clarifying question present | 17/29 (58.6%) |
| DM redirect present | 15/29 (51.7%) |
| personal data solicited | 0/29 |
| escalation consistency (gated replies) | 13/13 (100%) |
| intent gate pass | 19/29 (65.5%) |
| retrieval gate pass | 23/29 (79.3%) |
| auto-handle eligible | 16/29 (55.2%) |
| reply length | 127.0 chars / 23.4 words mean (corpus style: 100.8 / 19.1) — all ≤ 280 chars |
| latency | 599.9 ms mean LLM (642.7 ms total mean) |

**Honest reading.** The clean metrics are the safety-shaped ones: no
fabricated specifics and universal historical-case framing. The grounding
overlap of ~0.47 is a *lexical* proxy — a reply can paraphrase evidence
faithfully with fresh wording (lower overlap) or reuse evidence words while
asserting something new (higher overlap); no semantic entailment check was
run, and the five recorded caveats say so explicitly. LLM outputs are
nondeterministic: the numbers describe the recorded run (timestamped in the
artifacts), not a stable property. No human annotation or preference test
was performed, so no claim is made that the replies are subjectively
“good” — only that the measured grounding and safety proxies hold. Five
qualitative examples (lowest→highest grounding, with the evidence and gates
behind each reply) are in the dashboard and `phase5_summary.json`.

Reproduce (the live service must be running):

```bash
cd mini-services/retrieval-service && bun run dev   # port 3030, lazy worker
python scripts/evaluate_generation.py               # 29 replies + scoring
```

Artifacts: `evaluation/results/generation_results.json` (full per-example
records incl. prompts, evidence, gates, scores, timings) and
`evaluation/results/phase5_summary.json` (dashboard-ready summary). The
`/api/phase5/generate` endpoint powers the dashboard's live demo (~0.6 s per
reply after the one-time ~15 s worker warm-up).

## 10. Escalation Policy — *executed, Phase 6*

Rule-based, explainable, and deliberately conservative: **a false auto-handle
(a wrongly auto-published reply) is far costlier than a false escalation (a
human reviews a message they did not need to)**. The policy consumes only
signals available *before* any reply is drafted — the Phase 3 head's
predicted intent + confidence, the Phase 4 top-1 retrieval score, and the raw
message text — and escalates if ANY rule fires:

| rule | fires when | why |
|---|---|---|
| **E2** private-state domain | intent ∈ {billing_purchases, repair_warranty, account_icloud, security_privacy, support_process} | the correct next step depends on private state the system cannot see (an order, a quote, an account, verified identity, official channels) |
| **E3** unmatched intent | intent = `other` | no groundable issue class; an evidence draft would rest on irrelevant cases |
| **E4** sensitive content | message matches payment/order language, an email address, a phone number, or a card-like number | defense-in-depth against intent misclassification; private data must not be answered — or echoed — publicly |
| **G1** intent-confidence gate | confidence < 0.60 | Phase 3 measured 0.780 mean confidence on correct vs 0.508 on wrong test predictions |
| **G2** retrieval-evidence gate | top-1 score < 0.65 | Phase 4 measured Recall@5 0.826 above vs 0.586 below the threshold |

Four of the five E2 domains mirror the Phase 2 taxonomy's
`typically_escalated` hints; `account_icloud` is a **documented Phase 6
refinement** of the Phase 2 hint (decision log D25): sign-in/lockout reports
are indistinguishable from takeover-adjacent situations at the intent level,
and public advice on password matters can compound a lockout. No rule was
tuned on the test labels; the numeric gates reuse the thresholds fixed since
Phases 3/4.

**Ground truth (evaluation/escalation_labels.json):** the 29 golden TEST
openers were labelled by the author against fixed written criteria
(money/account stakes; safety/off-topic; ambiguity; unusable device/data at
stake → escalate; single clear technical issue → auto_ok) before the policy
was run on them: **10 escalate / 19 auto_ok**.

**Measured (scripts/evaluate_escalation.py → escalation_results.json +
phase6_summary.json, 2026-09-16):**

| metric | value |
|---|---|
| **false-auto rate (primary safety metric)** | **0/10 = 0.000** · exact CI95 [0.000, 0.309] |
| precision / recall / F1 (escalate = positive) | 0.7143 / 1.0000 / 0.8333 |
| over-escalation rate (honest cost) | 4/19 = 0.2105 |
| auto-handle rate | 15/29 = 0.5172 |
| rule fires across the test set | G1×10 · G2×6 · E2×3 · E3×2 · E4×1 |
| ablation vs Phase 5 gates-only | gates alone would auto-handle 16; the policy auto-handles 15 — the one flipped decision is golden opener #25 (account_icloud, confidence 0.825, top-1 0.769 — *both gates pass*) whose ground truth is escalate (iCloud sign-in loop rejecting a newly changed password): **rule E2 catches exactly the case the numeric gates cannot** |

The four over-escalations are all G1 fires (confidence 0.316–0.577 on
messages a human would auto-answer) — the honest reading: the Phase 3
classifier's confidence calibration is now the bottleneck for auto-rate, and
improving it is the cheapest path to fewer unnecessary human reviews. At
n=29 every rate carries its exact Clopper-Pearson interval; 0/10 false-autos
bounds the true rate below ~31% at 95% confidence, not at zero.

### 10.1 Unified agent — *executed, Phase 7*

The agent composes everything prior into one explainable call
(`/api/phase7/agent` on the live service): **Phase 3 head → Phase 4
retrieval → Phase 6 policy → and only then**, if and only if the decision is
`auto_handle`, **Phase 5 generation**. An escalated message never reaches
the LLM at all — the human receives a structured handoff bundle instead
(fired rules with observed values, top-3 evidence for context, an optional
deterministic public-acknowledgment template that is never sent
automatically).

The service's policy is a faithful TypeScript mirror of
`src/escalation/policy.py` (same rules, same `.env` thresholds), and the
Phase 7 evaluation *asserts* the two implementations agree
(scripts/evaluate_agent.py, 2026-09-16):

| metric | value |
|---|---|
| agent calls on the golden TEST openers | 29/29 succeeded |
| **TS↔Python policy consistency** | **29/29 decisions + rule sets identical** |
| response structure correct (auto⇒scored reply, escalate⇒handoff with llm_ms=0) | 29/29 |
| live decisions vs ground truth | TP 10 · FP 4 · **FN (false-auto) 0** · TN 15 — identical to the offline Phase 6 application |
| LLM calls made / skipped by policy | 15 / **14 (48.3% saved)** |
| end-to-end latency | auto 734.9 ms vs escalate **28.1 ms** (escalations pay only embed+FAISS+policy) |

### 10.2 Streamlit app — *executed, Phase 8*

`streamlit_app.py` is the assignment's Python UI: a deliberately thin client
over the same live agent endpoint — the app itself contains **no ML and no
LLM code**, so there is exactly one code path for the whole pipeline
(decision log D22 pattern extended). It renders the disclaimer, live service
health, the message box with golden-set examples, the decision banner, the
rule trace, the grounded reply + heuristic scores (or the human-handoff
bundle), and the evidence expander. Verified two ways: Streamlit's AppTest
framework (zero exceptions; both decision paths exercised) and live browser
screenshots (captured in the web dashboard's Phase 8 section). Run: `streamlit
run streamlit_app.py --server.port 8501 --server.headless true` with the
retrieval service up.

## 11. Evaluation — *Phases 1–7 results*

**Executed in Phase 1:** dataset scan statistics (§3), cleaning report (§4),
reconstruction diagnostics (§4), 7/7 structural validations, EDA distributions
(§5, notebook `01_data_exploration.ipynb` executed end-to-end with 16/16
cross-check assertions against `eda_summary.json`).

**Executed in Phase 2:** golden-set validation gate (all 200 rows labelled
exactly once; labels restricted to taxonomy; splits stratified), baseline
metrics on val/test (accuracy, macro/weighted P/R/F1, per-class reports,
confusion matrix — full numbers in `evaluation/results/baseline_results.json`,
dashboard-ready summary in `phase2_summary.json`), hyperparameter-selection
grid (16 configs, CV-on-train), and the golden-set isolation manifest.

**Executed in Phase 3:** embedding classifier evaluation under the Phase 2
protocol — 8-config CV-on-train hyperparameter selection for the LogReg
head, both heads on val/test (accuracy, macro/weighted F1, per-class
reports, confusion matrices), measured rare-class over-sampling comparison,
confidence preview at the configured 0.60 threshold, and 10-example test
error analysis with confidences (full numbers in
`evaluation/results/embedding_results.json`, dashboard-ready summary in
`phase3_summary.json`).

**Executed in Phase 4:** retrieval evaluation — golden isolation asserted
both ways (200 conversations, 266 pairs removed), corpus embedding with a
restartable 5k-text chunk cache, exact-cosine FAISS index with a structural
self-retrieval check, Recall@1/3/5 + MRR@5 on the golden val and test
openers under the D19 relevance definition, retrieval-as-classifier
(majority vote) comparison against the Phase 3 head, the configured
threshold preview, and 5 qualitative examples with honest hit/no-hit
outcomes (full per-query detail in
`evaluation/results/retrieval_results.json`, dashboard-ready summary in
`phase4_summary.json`).

**Executed in Phase 5:** generation evaluation — 29 evidence-grounded LLM
replies on the golden test openers through the live service, scored with
transparent lexical heuristics (grounding overlap, unsupported specifics,
safety framing, clarifying/DM behaviour, personal-data solicitation),
Phase 6 gate preview with escalation-consistency measurement, length vs
corpus style, and latency (full per-example records incl. prompts and
evidence in `evaluation/results/generation_results.json`, dashboard-ready
summary in `phase5_summary.json`).

**Executed in Phase 6:** escalation-policy evaluation — the rule-based
policy applied to the recorded Phase 5 runtime signals, scored against the
human ground-truth labels: false-auto rate with exact Clopper-Pearson CIs,
precision/recall/F1, over-escalation and auto-handle rates, per-rule fire
statistics, the gates-only ablation, and every over-escalation as a
qualitative example (full per-example records in
`evaluation/results/escalation_results.json`, dashboard-ready summary in
`phase6_summary.json`, labels + criteria in `evaluation/escalation_labels.json`).

**Executed in Phase 7:** unified-agent evaluation — 29 live end-to-end agent
calls through `/api/phase7/agent`, with the cross-implementation policy
consistency assertion (TypeScript service mirror vs `src/escalation/policy.py`
on identical signals), response-structure checks, fresh decision quality
against the same ground truth, LLM-call savings, and auto-vs-escalate latency
(full records in `evaluation/results/agent_results.json`, dashboard-ready
summary in `phase7_summary.json`).

**Executed in Phase 8:** Streamlit-app verification — AppTest run of
`streamlit_app.py` (zero exceptions; both decision paths exercised against
the live service) plus live browser screenshots; no new metrics claimed
beyond the Phase 7 numbers the app displays.

## 12. Results

See §1 (headline numbers), §3–§6 (detail), and the artifacts:
`data/processed/` — `applesupport_tweets.csv` (237,745 rows),
`conversations.csv` (80,966), `conversation_pairs.csv` (106,137),
`pipeline_run.json`, `eda_summary.json`, `charts/` (6 PNGs);
`evaluation/` — `golden_set.csv` (200 rows), `golden_labels.json`,
`labeling_worksheet.jsonl`, `split_assignments.csv`,
`golden_conversation_ids.json`, `sampling_frame.json`,
`results/baseline_results.json`, `results/phase2_summary.json`,
`results/embedding_results.json`, `results/phase3_summary.json`,
`results/retrieval_results.json`, `results/phase4_summary.json`;
`models/` — `embedding_logreg_head.joblib` (+ `.json` metadata),
`embedding_prototype.joblib`, `retrieval_index.faiss` (+ `.json` sidecar),
`retrieval_corpus.jsonl.gz`, `embedding_cache/`; `evaluation/results/` adds
`generation_results.json` + `phase5_summary.json` (Phase 5),
`escalation_results.json` + `phase6_summary.json` + `escalation_labels.json`
(Phase 6), `agent_results.json` + `phase7_summary.json` (Phase 7);
`streamlit_app.py` (Phase 8); this report + decision_log D1–D27 (Phase 9).
Reproduce with:

```bash
python scripts/find_author_ids.py     # verify APPLE_SUPPORT_AUTHOR_ID
python scripts/prepare_data.py        # full-scale: ~212 s, <1 GB RAM
python scripts/run_eda.py             # EDA summary + charts
python scripts/build_golden_set.py sample --n 200 && \
  python scripts/build_golden_set.py build    # golden set + splits
python scripts/train_baselines.py     # baseline metrics
pip install -r requirements.txt && \
  python scripts/train_embedding_classifier.py   # Phase 3 classifier
python scripts/build_retrieval_index.py   # Phase 4 index + Recall@K
cd ../mini-services/retrieval-service && bun run dev && cd ../hiver-support-agent
python scripts/evaluate_generation.py   # Phase 5 grounded replies + scoring
python scripts/evaluate_escalation.py   # Phase 6 policy vs ground truth
python scripts/evaluate_agent.py        # Phase 7 live agent + consistency
streamlit run streamlit_app.py --server.port 8501 --server.headless true
```

## 13. Failure Analysis

Data-quality findings from the executed run (all handled + reported):

* **Dangling child links (14,005):** `response_tweet_id` values referencing
  tweets outside the filtered corpus. Handled: parent links are authoritative;
  dangling links are counted, never followed.
* **Partial roots (913):** threads whose starter tweet was not collected
  (deep-thread closure budget or dataset gaps). Handled: they root their own
  partially-observed conversation; boundaries stay stable.
* **Non-converging closure tail (+41 tweets at pass 12):** ultra-deep threads
  grow ~1 hop per pass. Pairs unaffected (all support replies collected in
  pass 1). Documented; pass budget is configurable.
* **Timestamp noise:** replies occasionally carry timestamps inconsistent with
  their structural position (twcs is known to be imperfect). Handled: thread
  order is structural, timestamps are display metadata only. The corpus
  date-range min (2013) is an outlier — bulk of threads are late 2017.
* **URL-heavy replies (99,269 URLs removed):** AppleSupport replies often link
  to support articles; the link targets are lost (dataset contains no
  resolved URLs). Consequence: some replies read as fragments ("Please take a
  look at this:"). Kept — they are still valid evidence of *how* support
  responded.
* **Keyword-matching pitfall (caught in QA):** substring matching made `app`
  match inside `apple`, inflating Software/Apps to 64.5%; fixed with
  word-boundary matching (29.0%). Recorded as decision D11.
* **Escalation over-fires on low classifier confidence (Phase 6):** all four
  over-escalations are G1 fires — the head's confidence (0.316–0.577) fell
  below 0.60 on messages a human would auto-answer (e.g. “my App Store is
  not working!!!!”, predicted `device_hardware` 0.367). Root cause is
  calibration on short informal messages, not the threshold. Every case is
  listed with its reasons in `escalation_results.json`; the safety asymmetry
  (§10) accepts this cost deliberately.
* **The one decision the numeric gates got wrong (caught by rule E2):**
  golden opener #25 — an iCloud sign-in loop rejecting a newly changed
  password — passed BOTH gates (confidence 0.825, top-1 0.769) yet its
  ground truth is escalate; the private-state domain rule is what catches
  it. This is the concrete justification for domain rules on top of numeric
  gates.

## 14. Safety Considerations

* Historical evidence framing is enforced in all user-facing surfaces
  (dashboard, notebook, README, this report).
* **Phase 5 enforces assignment §16 in the prompt itself:** six
  non-negotiable rules — evidence-only facts (no invented prices, dates,
  versions, policies, links), explicit “based on similar cases” framing
  (never current-policy claims), a clarifying question instead of guessing
  on weak evidence, DM redirect for account/payment/security matters (never
  soliciting personal details in public), evidence-matched concise style,
  and a 280-char cap. Compliance is *measured*, not assumed: 0 unsupported
  specifics, 100% framing compliance, 0 personal-data solicitations, and
  13/13 escalation-consistent gated replies in the recorded run.
* No credentials, passwords or personal data are stored; the pipeline never
  requests anything from users (Phase 1 is offline data processing; the
  Phase 5 demo sends only the typed message to the backend LLM).
* Raw data stays local (gitignored); outputs contain only public tweets.
* **Phase 6 makes the auto/escalate decision a measured, explainable
  layer instead of an accident:** the policy fires before any LLM call, so
  an escalated message never generates (or publishes) a draft at all; every
  decision ships its full rule trace; and the primary safety metric — the
  false-auto rate — is evaluated against human ground truth (0/10, exact CI
  reported). The Phase 7 agent preserves this property end-to-end (the LLM
  is unreachable on the escalate path — 0 ms, 0 calls), and the
  TS↔Python policy consistency assertion (29/29) guarantees the live service
  cannot drift from the evaluated policy.
* The suggested public acknowledgment offered to human agents on escalation
  is a deterministic template, clearly labelled “never sent automatically” —
  the system never publishes anything without either passing every policy
  rule or a human in the loop.

## 15. Limitations

* **Golden set is small (200) and severely class-imbalanced** — `software_bug`
  holds 128/200 examples; rare classes have 1–2 test examples, so per-class
  test numbers are directional only. This is a property of the natural
  distribution being estimated, not a sampling bug; growing the golden set
  is the standing lever (Phase 3 measured the training-only reweighting
  alternative: balanced class weights helped CV macro-F1, but test
  per-class supports of 1–2 keep any per-class claim directional).
* **Corpus period concentration:** 99.5% of openers are Sep–Dec 2017 (iOS 11
  rollout) — metrics measure that window (§5 period note).
* Provisional Phase 1 topics remain keyword heuristics (now subsumed by the
  taxonomy and reused as the keyword baseline).
* Closure truncates ultra-deep threads beyond the pass budget (0.017% of
  tweets; no pair loss).
* The EDA "conversations" count for the whole dataset (794,335) counts
  conversation *starters* — threads whose starter is missing from the corpus
  are not included in that total.
* Reply link targets (shared URLs) are not resolvable in the dataset.
* English-only corpus; a few non-English messages are present and were
  labelled `other` where not confidently classifiable (documented in the
  labelling method).
* Single manual labeler (the author); inter-rater agreement is not measurable
  — mitigated by the documented taxonomy definitions, examples and the
  automated validation gate.
* **Phase 5 grounding overlap is a lexical proxy** (token coverage), not
  semantic entailment — a paraphrased-but-faithful reply scores lower than a
  verbose-but-drifting one. The unsupported-specifics check covers only
  numbers, version-like tokens, prices and URLs; fabricated prose claims
  would pass it. LLM outputs are nondeterministic, so generation metrics
  describe the recorded run rather than a stable property; no human
  annotation or preference test was performed.
* **Escalation ground truth is a single annotator's judgement** (the author,
  fixed written criteria, labels recorded before the policy was run on them)
  — no inter-rater agreement exists, and the 29-message test split means the
  headline 0/10 false-auto rate carries an exact CI95 upper bound of 0.309.
  The Phase 7 live evaluation reuses the same labels, so it inherits this
  caveat rather than independently confirming it.
* The Phase 7 TS↔Python consistency check compares decisions and rule ids on
  identical inputs — it is a regression guard, not evidence of policy
  *correctness* (which rests solely on the ground-truth evaluation above).

## 16. Future Improvements

All nine assignment phases are delivered. Post-assignment follow-ups, in
rough priority order: **calibrate or temperature-scale the Phase 3
confidence surface** — all four over-escalations are G1 fires, so better
confidence on short informal messages directly buys auto-rate; grow the
golden set with a second labelling pass (rare classes have 1–2 test
examples) and a second annotator for the escalation labels (inter-rater
agreement); fine-tune or domain-adapt the encoder on the unmatched pool;
hybrid keywords+embeddings router to combine the keyword baseline's
rare-class precision with the embedding head's context sensitivity;
human-label a small retrieval relevance sample to calibrate the D19
proxy against human judgement; a light re-ranker over the top-K for
generation grounding; semantic entailment checks (NLI) instead of lexical
overlap and per-intent prompt variants for reply quality; parallelise
chunk passes, persist the closure frontier to resume interrupted runs,
and add dataset drift checks.

## 17. Conclusion

Phase 1 is complete and verified: the real twcs corpus loads, validates and
filters to 80,966 AppleSupport conversations; threads are reconstructed
faithfully (structural ordering, noise handled); 106,137 evidence pairs are
extracted with leakage-safe conversation identity; EDA is executed, charted
and cross-checked across three consumers. Phase 2 is complete and verified on
top of it: a 10-class EDA-grounded taxonomy, a validated manually-labelled
golden set with leakage-free conversation-level splits, and three measured
baselines whose honest failure analysis (majority wins accuracy, keywords win
macro-F1, the learned baseline collapses) precisely motivated the Phase 3
embedding classifier. Phase 3 is complete and verified on top of *that*: the
frozen-encoder classifier fixed the measured class collapse (macro-F1
0.078 → 0.303 learned / 0.389 centroid, ≈3.9×) while exposing an informative
confidence surface for the Phase 6 escalation policy — with every artifact,
including the reusable heads and per-example error analysis, reproducible
from configuration. Phase 4 is complete and verified on top of all of it:
the retrieval layer indexes the golden-isolated corpus with exact cosine
FAISS, measures Recall@K honestly under a documented relevance definition,
surfaces two useful secondary findings (kNN-over-corpus edges past the
trained head; the 0.65 threshold gates grounding reliably), and serves the
index live to the dashboard — the evidence pipeline Phases 5–6 will consume
for grounded generation and escalation. Phase 5 is complete and verified on
top of all of it: the same inputs the escalation policy will see (intent
confidence, top-1 cosine, the five evidence pairs) now feed one grounded,
safety-ruled prompt per message, the backend LLM drafts Twitter-length
replies through a live endpoint, and reply quality is measured with stated
lexical heuristics rather than claimed — zero unsupported specifics, full
safety-framing compliance, and full escalation consistency among gated
replies in the recorded run, with the grounding proxy and every other
caveat documented alongside the numbers it qualifies. Phase 6 closes the
safety loop: a five-rule explainable policy, labelled against fixed human
criteria and measured on the same golden test set — **zero false-autos
(0/10, exact CI reported), perfect recall, and a 21% over-escalation cost
whose every instance is documented** — with the domain rules catching
exactly the gate-passing account case the numeric gates cannot. Phase 7
composes the whole system into one agent whose escalate path cannot reach
the LLM at all (48.3% of calls skipped, 28 ms end-to-end) and whose live
decisions provably match the evaluated policy (29/29 cross-implementation
consistency). Phase 8 exposes the same agent through the assignment's
Streamlit UI with no duplicated logic. Phase 9 is this report: every phase
measured before the next began, every threshold documented, every
limitation stated with its interval — an evidence-grounded support agent
that is as honest about what it cannot do as about what it measured.
