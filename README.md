# ResearchMind AI — Milestone 4

AI research assistant: PDF ingestion with vector search, grounded RAG Q&A, literature
screening and extraction, draft writing, Zotero import, shared workspaces, Stripe
billing and an admin console.

## Stack

| Service | Tech | Container port | Host port |
|---|---|---|---|
| `fe` | Next.js 14 (App Router, Tailwind) | 3000 | **3010** |
| `be` | Node 20 / Express | 5000 | **5010** |
| `ai` | FastAPI + sentence-transformers | 8000 | **8011** |

Postgres (Neon) with `pgvector` holds both relational data and embeddings.
`be` reaches `ai` in-cluster at `http://ai:8000`.

Host ports are deliberately **3010 / 5010** to match the registered Google OAuth
redirect URI (`http://localhost:5010/api/auth/google/callback`); `ai` uses **8011**
to avoid clashing with other local services. Changing them means updating the
redirect URI in Google Cloud Console too.

## Layout

```
AI/          FastAPI service — ingestion, retrieval, LLM calls
  app/
    routers/     HTTP endpoints (query, ingest, review, citations, zotero, …)
    services/    retrieval, chunking, embedding, prompting, guardrails
    models/      pydantic schemas
BE/          Express API — auth, documents, billing, admin, workspaces
  src/
    routes/      route definitions       controllers/  request handlers
    services/    stripe, mailer, AI proxy  middleware/  auth, plan, upload
  scripts/     migrate · seed-admin · stripe-setup
FE/          Next.js app
  app/         routes (App Router)      components/   UI
  lib/         api client, auth, hooks
migrations/  forward-only *.sql, applied by `npm run migrate`
schema.sql   full current schema (reference; migrations are the source of truth)
```

## Prerequisites

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**, running.
  You do **not** need Node, Python or pnpm locally — everything runs in containers.
- **Git**.

## Setup

Secrets are not committed. Create your env files from the templates:

```bash
cp AI/.env.example            AI/.env
cp BE/.env.example            BE/.env
cp FE/.env.example.local      FE/.env.local
```

Then fill in, at minimum:

| Variable | Where | How to get it |
|---|---|---|
| `DATABASE_URL` | `AI/.env` **and** `BE/.env` (same value) | A Postgres DB with `pgvector` — e.g. a free [Neon](https://neon.tech) project |
| `LLM_API_KEY` | `AI/.env` | Any OpenAI-compatible provider ([OpenRouter](https://openrouter.ai), [Groq](https://console.groq.com), OpenAI). Set `LLM_BASE_URL` / `LLM_MODEL` to match. |
| `JWT_SECRET` | `BE/.env` | 64+ random hex chars |

Google OAuth, Stripe billing and SMTP contact-form email are optional — leave those
keys blank and the app runs with email/password auth, billing disabled and contact
messages stored to the DB only (readable in the admin console).

Every available option is documented in the `.env.example` files.

## Run

```bash
docker compose up --build
```

First build takes several minutes — the `ai` image downloads the
`BAAI/bge-base-en-v1.5` embedding model.

- Frontend — http://localhost:3010
- Backend health — http://localhost:5010/health
- AI health — http://localhost:8011/health

Apply the database schema (idempotent, safe to re-run):

```bash
docker compose exec be npm run migrate
```

Optional one-time setup:

```bash
docker compose exec be npm run seed:admin    # create the super admin
docker compose exec be npm run stripe:setup  # create Stripe products/prices
```

Later starts don't need a rebuild:

```bash
docker compose up        # add --build only after pulling code changes
docker compose down      # stop
```

## Development

Python linting and formatting use [ruff](https://docs.astral.sh/ruff/), configured in
`AI/pyproject.toml`:

```bash
ruff check AI            # lint
ruff check --fix AI      # apply safe fixes
ruff format AI           # format
```

The frontend uses the Next.js ESLint config: `cd FE && pnpm lint`.

> **FE installs with `pnpm`, not `npm`** — npm corrupts the dependency tree for this project.

## Troubleshooting

- **Port already in use** — another project holds 3010/5010/8011. Stop it, or change
  the host side of the `"host:container"` pairs in `docker-compose.yml` (see the OAuth
  caveat above before changing 5010).
- **AI logs `Temporary failure in name resolution`** — the container failed to attach to
  the docker network, usually after a port conflict.
  Run `docker compose up -d --force-recreate ai`.
- **BE logs `DB warmup failed: Connection terminated due to connection timeout`** on
  startup — a harmless one-time Neon cold start. It retries every 4 minutes and on real
  requests.
- **Google sign-in hits an unreachable page** — open the app via `http://localhost:3010`
  and keep the 3010/5010 mappings, or update the redirect URI in Google Cloud Console.
