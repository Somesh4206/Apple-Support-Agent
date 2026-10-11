# APPLE SUPPORT AI

### Evidence-Grounded Customer Support Agent — technical assignment for Hiver

A machine-learning system that classifies AppleSupport customer issues,
retrieves historically similar support cases, generates responses **grounded
in that historical evidence**, and decides safely between auto-handling and
escalation — with quantitative evaluation of every component. A production
**Next.js dashboard** (`dashboard/`) exposes the live agent as a real
multi-turn support chat experience.

> **Current status: Phases 1–9 complete — data foundation + taxonomy &
> baselines + embedding classifier + FAISS retrieval + grounded generation
> + escalation policy + unified agent + Streamlit app + final report, every
> phase measured.** The assignment's phased build is finished: each phase
> was implemented only after the prior one was working and tested. On top of
> the pipeline sits the dashboard: a live, stateful, multi-turn agent chat
> (SQLite-persisted sessions, decision badges, evidence citations, one-click
> transcript export).

---

## ⚠️ Historical-data disclaimer

The dataset contains **historical** customer-support interactions
(Customer Support on Twitter, 2017 era). Historical AppleSupport responses are
used strictly as *evidence* for retrieval, grounding and evaluation — they are
**not** a representation of current Apple policies, prices, warranty terms or
support practice.

---

## Problem statement

Given a customer support message, the system must (1) classify the issue,
(2) retrieve similar historical AppleSupport cases, (3) generate a reply
grounded in them, (4) auto-handle or escalate, and (5) measure all of the
above. All nine phases are delivered; each layer below is measured.

## Architecture (Phase 1 slice)

```
twcs.csv (516 MB, 2.8 M tweets, gitignored)
   │  scripts/find_author_ids.py ──► APPLE_SUPPORT_AUTHOR_ID (.env, never guessed)
   ▼
┌──────────────────────────────────────────────────────────────┐
│ scripts/prepare_data.py                                       │
│  1. scan + schema validation          (src/data/load.py)      │
│  2. AppleSupport thread closure       (memory-safe, chunked) │
│  3. conservative cleaning             (src/data/preprocess…) │
│  4. conversation reconstruction       (src/data/conversat…)  │
│  5. evidence-pair extraction          (customer ↔ reply)     │
│  6. 7-point validation gate           (exit ≠ 0 on failure)  │
└──────────────────────────────────────────────────────────────┘
   ▼ data/processed/
applesupport_tweets.csv · conversations.csv · conversation_pairs.csv
pipeline_run.json · (run_eda.py) eda_summary.json + charts/
   ▼
notebooks/01_data_exploration.ipynb (executed, cross-checked)
Next.js dashboard (dashboard/ — live pipeline status, agent chat, phase consoles)
```

Phases 6–9 (built): escalation policy
(false-auto 0/10 measured against human ground truth) → unified agent
(policy gates the LLM; 48.3% of test calls skip it) → Streamlit app →
final report.

## Dataset

Kaggle [`thoughtvector/customer-support-on-twitter`](https://www.kaggle.com/datasets/thoughtvector/customer-support-on-twitter)
— place `twcs.csv` in `data/raw/` (never committed). Full column semantics
and the AppleSupport account-identification workflow: see
[`data/README.md`](data/README.md).

## Setup

```bash
# repo root = the ML pipeline
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt                      # pandas, numpy, matplotlib, seaborn, python-dotenv, scikit-learn
cp .env.example .env

# 1) discover the Apple support account id from the data (do not guess it)
python scripts/find_author_ids.py
#    -> set APPLE_SUPPORT_AUTHOR_ID=AppleSupport in .env

# 2) put twcs.csv into data/raw/ (download options in data/README.md)
#    (no Kaggle access? smoke-test instead:)
#    python scripts/make_synthetic_sample.py   # clearly-labelled synthetic sample

# 3) build Phase 1 artifacts (full scale: ~212 s, <1 GB RAM)
python scripts/prepare_data.py

# 4) EDA summary + charts
python scripts/run_eda.py

# 5) Phase 2: golden set + baselines
python scripts/build_golden_set.py sample --n 200
python scripts/build_golden_set.py build      # validate labels, split, manifest
python scripts/train_baselines.py            # metrics -> evaluation/results/

# 6) Phase 3: embedding classifier (installs sentence-transformers/torch)
python scripts/train_embedding_classifier.py  # metrics + reusable model heads

# 7) Phase 4: FAISS retrieval index + Recall@K (installs faiss-cpu)
python scripts/build_retrieval_index.py      # index + evaluation + live-service corpus

# 8) Phase 5: grounded reply generation + honest reply scoring
#    (needs the live service running — see the next step)
python scripts/evaluate_generation.py         # 29 grounded replies -> results/

# 9) Phase 6: escalation policy vs human ground truth (offline, deterministic)
python scripts/evaluate_escalation.py         # false-auto / precision / recall -> results/

# 10) Phase 7: unified agent end-to-end (needs the live service)
python scripts/evaluate_agent.py              # 29 live agent calls + consistency -> results/

# 11) Phase 8: Streamlit app (needs the live service on :3030)
streamlit run streamlit_app.py --server.port 8501 --server.headless true

# 12) The live retrieval + generation + agent service powering the demos
bun run dev          # inside dashboard/mini-services/retrieval-service (port 3030)

# 13) The Next.js dashboard (live agent chat — see dashboard/README.md)
cd dashboard && bun install && bun run dev        # http://localhost:3000
```

Environment variables (`.env`) — full list in `.env.example`:
`APPLE_SUPPORT_AUTHOR_ID` (required), `RAW_DATA_PATH`, `PROCESSED_DIR`,
`RANDOM_SEED`, `CHUNK_SIZE`, `CLOSURE_MAX_PASSES`; `EMBEDDING_MODEL`
(consumed since Phase 3, default `sentence-transformers/all-MiniLM-L6-v2`);
Phase 4+ thresholds (`INTENT_CONFIDENCE_THRESHOLD=0.60` — already measured
as a preview in Phase 3, `RETRIEVAL_THRESHOLD=0.65`, `TOP_K=5`) are consumed
by the Phase 5 generation service (parsed from this same `.env`);
`LLM_MODEL`/`LLM_API_KEY` remain reserved and unused — generation goes
through the backend-only z-ai-web-dev-sdk.
**Never commit `.env`.**

## Example output (real run)

`python scripts/prepare_data.py` on the full Kaggle dataset:

```
INFO  prepare_data: AppleSupport author id: 'AppleSupport' | input: .../twcs.csv (synthetic=False)
INFO  src.data.load: Scan complete: 2811774 rows (2811774 unique tweet ids, 0 duplicates),
                    1537843 inbound / 1273931 outbound, 794335 conversation starters
INFO  src.data.load: Closure pass 12/12: +41 rows recorded (238754 total)
INFO  src.data.preprocessing: Preprocessing: 238754 -> 237967 rows (dropped: 787 empty text)
INFO  src.data.conversations: Reconstructed 81156 conversations from 237967 tweets
INFO  src.data.conversations: Filtered to 80966 / 81156 conversations involving author 'AppleSupport'
INFO  src.data.conversations: Extracted 106137 customer↔support pairs
INFO  prepare_data: VALIDATION pair_ids_exist_in_tweets  PASS — 106137 pair endpoint ids resolved
... (7/7 PASS)
INFO  prepare_data: PHASE 1 PREPARATION COMPLETE in 211.8s
```

A reconstructed pair (from `conversation_pairs.csv`):

| conversation_id | customer_message | support_response |
|---|---|---|
| 14838 | "iOS 11 is draining the battery on my iPhone 7 twice as fast as iOS 10. Help!" | "We'd like to gather some more information for better troubleshooting. Can you DM us the country you are locate…" |

## Metrics (Phases 1–7 — actually measured)

| metric | value |
|---|---|
| tweets scanned (full corpus) | 2,811,774 |
| AppleSupport conversations | 80,966 |
| AppleSupport corpus tweets | 237,745 (130,612 inbound / 107,133 outbound) |
| customer↔support evidence pairs | 106,137 |
| avg / median / max turns per conversation | 2.94 / 2 / 282 |
| avg message length | 100.8 chars · 19.1 words |
| intent taxonomy classes (Phase 2) | 10 (EDA-anchored + unmatched-pool split) |
| golden set (Phase 2) | 200 manually labelled · split 142/29/29 · seed 42 |
| keyword-rules baseline (test) | accuracy 0.483 · macro-F1 **0.391** |
| majority baseline (test) | accuracy **0.655** · macro-F1 0.079 |
| TF-IDF + LogReg baseline (test) | accuracy 0.621 · macro-F1 0.078 |
| **MiniLM + LogReg head (Phase 3, test)** | accuracy 0.655 · macro-F1 **0.303** · weighted-F1 **0.659** |
| **MiniLM + centroids (Phase 3, test)** | accuracy 0.552 · macro-F1 **0.389** (zero hyperparams) |
| confidence (Phase 3, test) | 0.780 mean on correct vs 0.508 on wrong |
| **retrieval index (Phase 4)** | 105,871 pairs (106,137 − 266 golden-conversation pairs) · exact cosine FAISS |
| **Recall@1/3/5 (Phase 4, golden test)** | **0.586 / 0.655 / 0.759** · MRR@5 0.651 |
| retrieval majority-vote (Phase 4, test) | accuracy **0.690** — above the Phase 3 head |
| retrieval threshold 0.65 (Phase 4, test) | 79.3% of openers above · Recall@5 0.826 among them |
| **grounded generations (Phase 5, test)** | **29/29 succeeded** · zero unsupported specifics · 100% safety framing |
| grounding token overlap (Phase 5, test) | mean **0.474** (median 0.500) — lexical proxy, caveats recorded |
| escalation consistency (Phase 5, test) | 13/13 gated replies ask a clarifying question or redirect to DMs |
| reply style (Phase 5, test) | 127.0 chars / 23.4 words mean (corpus: 100.8 / 19.1) · all ≤ 280 chars |
| generation latency (Phase 5) | 599.9 ms mean LLM per reply (live service) |
| **escalation false-auto rate (Phase 6, test)** | **0/10** · exact CI95 [0.000, 0.309] |
| escalation precision / recall / F1 (Phase 6) | 0.7143 / **1.0000** / 0.8333 |
| over-escalation (Phase 6, honest cost) | 4/19 = 0.2105 — all four are low-confidence G1 fires, documented |
| **agent policy consistency (Phase 7)** | **29/29** TypeScript service mirror ≡ Python policy |
| agent decisions (Phase 7, live) | 15 auto / 14 escalate · false-auto 0 · TP 10 / FP 4 / TN 15 |
| **agent LLM-call savings (Phase 7)** | **48.3%** of test calls skip the LLM entirely |
| agent latency (Phase 7) | auto 734.9 ms vs escalate **28.1 ms** end-to-end |
| Streamlit app (Phase 8) | AppTest 0 exceptions · both decision paths verified live |
| structural validations | 7/7 PASS · self-retrieval check score 1.0000 |

Full Phase 3 detail: `evaluation/results/embedding_results.json`; Phase 4
detail: `evaluation/results/retrieval_results.json`; Phase 5 detail:
`evaluation/results/generation_results.json`; Phase 6 detail:
`evaluation/results/escalation_results.json` (+ ground truth in
`evaluation/escalation_labels.json`); Phase 7 detail:
`evaluation/results/agent_results.json`; all summarised in
`reports/report.md` §7–§11.

## Repository layout

```
apple-support-agent/
├── data/                  # raw (gitignored) + processed outputs + charts
├── notebooks/             # 01_data_exploration.ipynb (executed)
├── scripts/               # find_author_ids · prepare_data · run_eda · build_golden_set · train_baselines · train_embedding_classifier · build_retrieval_index · evaluate_generation · evaluate_escalation · evaluate_agent · make_synthetic_sample
├── src/
│   ├── config.py          # env-driven settings, no magic constants
│   ├── data/              # load · preprocessing · conversations
│   ├── intents/           # taxonomy · baselines (Phase 2) · embeddings · embedding_classifier (Phase 3)
│   ├── retrieval/         # faiss_index (Phase 4: build/save/load/search, exact cosine)
│   └── escalation/        # policy (Phase 6: five explainable rules, runtime signals only)
├── evaluation/            # Phase 2–7: golden set, labels, splits, escalation labels, results
├── models/                # Phase 3–4 artifacts (gitignored): heads, embedding cache, faiss index, live-service corpus
├── reports/               # report.md · decision_log.md (D1–D28)
├── streamlit_app.py       # Phase 8 UI (thin client over the live agent)
├── requirements.txt       # only packages actually used (Phases 1–8)
├── .env.example           # configuration template
├── .gitignore             # keeps the 516 MB corpus out of git
└── dashboard/             # Next.js 16 production app (see dashboard/README.md)
    ├── src/app/               # / — landing page + embedded agent chat
    ├── src/components/        # agent-chat/ (panel, messages, composer) + phase consoles
    ├── src/lib, src/hooks/    # typed API client + chat state (sessions, retries)
    ├── mini-services/
    │   └── retrieval-service/ # Bun :3030 + Python FAISS worker + z-ai LLM
    │                          # /api/agent/chat — stateful multi-turn agent (SQLite)
    ├── prisma/                # schema (SQLite)
    └── public/                # logo + Streamlit screenshots
```

### The dashboard (Phase 9+)

`dashboard/` is the user-facing product built on the pipeline: a live
**agent chat** (multi-turn, session persistence via SQLite, auto-handle vs
escalate decision badges, retrieval evidence citations, policy gate traces,
transcript export) served by the same Bun service that the Streamlit app
talks to. Start the retrieval service first (step 12), then the dashboard
(step 13) — the frontend calls it through relative gateway URLs and needs
no absolute addresses.

## Limitations & safety

* Historical evidence ≠ current policy (disclaimer above) — enforced in every
  user-facing surface and in the Phase 5 generation prompt itself (six
  non-negotiable safety rules; compliance measured, not assumed).
* Phase 5 reply-quality metrics are transparent lexical heuristics with
  recorded caveats (token-overlap grounding is a proxy, not entailment; LLM
  outputs are nondeterministic; no human annotation was performed).
* Provisional topics are transparent keyword heuristics feeding the Phase 2
  taxonomy; they are not a classifier.
* Ultra-deep threads are truncated by the configurable closure pass budget
  (0.017% of tweets; zero pair loss — all support replies are collected in
  pass 1).
* No model metrics are claimed anywhere in Phase 1; nothing is fabricated.

## Reproducibility

Deterministic seed (`RANDOM_SEED=42`), configuration-driven thresholds, run
metadata persisted per execution (`pipeline_run.json`), and a validation gate
that re-runs on every regeneration.
