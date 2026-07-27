# LLocal Companion Server

A small HTTP service that runs **on the same machine as Ollama** and gives the
LLocal mobile app the capabilities a phone can't run itself:

- **RAG / knowledge base** — embed & index documents (Faiss) and run similarity search.
- **Web search & URL scraping** — the same pipeline the desktop app uses.
- **Text-to-speech** — kokoro-js, run on the host.
- **Git** — clone an external repo (GitHub) onto the host, read/write/commit/push files, open PRs.
- **Command execution** *(optional, off by default)* — run commands on the host (unzip, build, …) so code work stays off the phone.
- **Ollama proxy** *(optional)* — reach Ollama through this server's single origin + token to avoid CORS/ATS on the device.

It reuses the desktop app's feature code directly (`src/shared/rag-core.ts`,
`src/main/utils/docs-generator.ts`, `src/main/websearch.ts`) — no logic is
duplicated.

## Requirements

- Node 18+ (Node 20+ recommended).
- `git` on `PATH` (for the Git routes).
- Ollama running locally with the embedding model pulled: `ollama pull all-minilm`.
- The **repo root** dependencies installed (`npm install` in the project root) — the
  server resolves the heavy feature libraries (langchain, faiss-node, kokoro-js,
  turndown, google-sr) from the root `node_modules`.

## Setup

```bash
# from the project root
npm install

# then the server's own light deps
cd server
npm install
cp .env.example .env      # edit LLOCAL_SERVER_TOKEN at minimum
npm start                 # runs with tsx; no build step needed
```

Point the mobile app's **Settings → Server & Repository** at
`http://<host-ip>:8787` with the same token.

## Configuration

See `.env.example`. Key variables:

| Var | Meaning |
|-----|---------|
| `LLOCAL_SERVER_TOKEN` | **Required.** Shared bearer token the app must send. |
| `OLLAMA_URL` | Ollama URL as seen from the host (default `http://127.0.0.1:11434`). |
| `LLOCAL_DATA_DIR` | Where vector DBs and cloned repos live (default `~/.llocal-server`). |
| `LLOCAL_CORS_ORIGIN` | Allowed CORS origin (`*` for a personal LAN). |
| `LLOCAL_ENABLE_EXEC` | `1` to enable `/exec`. Off by default. |
| `LLOCAL_EXEC_ALLOWLIST` | Optional comma list of allowed command names. |
| `GITHUB_TOKEN` | PAT for push/PR (can also be sent per-request). |

## Endpoints

All except `/health` require `Authorization: Bearer <token>`.

- `GET  /health`
- `POST /rag/add` (multipart `file`, or `{ repoPath }`) · `POST /rag/similarity` · `GET /rag/list` · `DELETE /rag/delete`
- `POST /websearch` `{ query, links? }`
- `POST /tts` `{ text }` → `audio/wav`
- `POST /git/clone` `{ owner, repo, branch?, token? }` · `GET /git/tree` · `GET /git/file` · `PUT /git/file` · `POST /git/commit|push|pull` · `POST /git/pr`
- `POST /exec` `{ command, owner?, repo? }` *(gated)*
- `ANY  /ollama/*` → proxied to `OLLAMA_URL`

## ⚠️ Security

This server can read/write a repo, talk to Ollama, and — if you enable it — **run
arbitrary commands on the host**. Treat the token like a password.

- **Always set a long, random `LLOCAL_SERVER_TOKEN`.** The server refuses to start without one.
- Prefer running it on a trusted LAN or behind a VPN/Tailscale, not the open internet. If you must expose it, put it behind HTTPS (a reverse proxy) and a firewall.
- `/exec` is **disabled by default**. Enable it only if you understand that anyone
  with the token can run commands as the server's user. Use `LLOCAL_EXEC_ALLOWLIST`
  to restrict which commands are permitted, and run the server as a low-privilege user.
- Path inputs for RAG delete and Git file access are constrained to the data / repo
  directories to prevent traversal, but the exec endpoint is intentionally powerful —
  scope it with the allowlist and OS permissions.
