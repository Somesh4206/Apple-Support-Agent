# Apple Support Agent — Dashboard

The production user-facing app for the Apple Support AI pipeline: a Next.js 16
single-page experience whose core is a **live, stateful, multi-turn agent
chat** backed by the retrieval service (FAISS evidence retrieval + grounded
LLM generation + escalation policy).

## What you get

- **Landing page** (`/`) — product-style hero, trust metrics (measured Phase 1–7
  numbers), how-it-works visualization, and the embedded agent chat.
- **Agent chat** — multi-turn conversation with:
  - session persistence across service restarts (SQLite on the service side,
    session id in `localStorage` on the client);
  - **decision badges** — `auto_handle` vs `escalate` per reply, with the
    policy gates that fired;
  - **evidence citations** — the historical AppleSupport pairs the reply is
    grounded in (expandable per message);
  - **intent + confidence + latency** traces on every turn;
  - one-click **transcript export** (Markdown).
- **Documentation view** — the full Phase 1–9 engineering story (metrics,
  decisions, failure analysis) for the technical reader.

## Architecture

```
Browser ── relative URLs (/api/…?XTransformPort=3030) ──► retrieval-service (Bun :3030)
                                                              ├── /api/agent/chat   stateful multi-turn agent
                                                              ├── Python FAISS worker (models/ from pipeline)
                                                              └── z-ai LLM (backend only, never client-side)
```

The Next.js app itself is a thin client: no ML code, no secrets — all
pipeline access goes through the service.

## Prerequisites

1. The ML pipeline must have produced `models/` (Phase 3 + Phase 4 artifacts)
   — run `scripts/train_embedding_classifier.py` and
   `scripts/build_retrieval_index.py` from the repo root first.
2. [Bun](https://bun.sh) for both the service and the app; Python 3.11+ venv
   with `requirements.txt` installed for the FAISS worker.

## Run

```bash
# 1) start the live service (port 3030)
cd mini-services/retrieval-service
bun install
bun run dev            # serves /api/agent/chat, /api/phase4/health, …

# 2) start the dashboard (port 3000)
cd ../..               # back to dashboard/
bun install
cp .env.example .env   # then edit as needed
bun run dev            # http://localhost:3000
```

> In this sandbox deployment the app is served behind a gateway that routes
> `/api/*?XTransformPort=3030` to the service — the code only ever uses
> **relative** URLs, so it works unchanged behind any such proxy.

## Configuration (`.env`)

| variable | purpose |
|---|---|
| `DATABASE_URL` | Prisma SQLite URL (dashboard-side store) |
| `NEXT_PUBLIC_APP_NAME` | optional display name override |

The agent service reads pipeline thresholds (`TOP_K`, `RETRIEVAL_THRESHOLD`,
`INTENT_CONFIDENCE_THRESHOLD`) from the repo-root `.env` of the pipeline.

## Notes

- The chat service persists conversations in `mini-services/retrieval-service/chat.db`
  (gitignored) — delete the file to reset all sessions.
- LLM access is backend-only via `z-ai-web-dev-sdk`; no keys ship with the repo.
