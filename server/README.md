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
- `POST /exec` `{ command, owner?, repo? }` *(gated)* — response includes a `warning` reminder that the command ran on the host.
- `GET  /pairing` → current pairing payload + reachable LAN URLs
- `POST /pairing/rotate` → mint a new bearer token, persist it, return the fresh payload *(invalidates the old token immediately)*
- `ANY  /ollama/*` → proxied to `OLLAMA_URL`

### Pairing

To point the mobile/web app at this server without hand-typing the token, the
app calls `GET /pairing`. The server returns a compact, URL-safe **pairing
payload** — a base64url-encoded `{ serverUrl, token, version }` — plus every
LAN URL the host is reachable on:

```jsonc
{
  "payload": "eyJ1IjoiaHR0cDovLzE5Mi4xNjguMS4xMDo4Nzg3IiwidCI6Ii4uLiIsInYiOiIxIn0",
  "serverUrl": "http://192.168.1.10:8787",
  "candidateUrls": ["http://192.168.1.10:8787", "http://10.0.0.5:8787"],
  "hosts": ["192.168.1.10", "10.0.0.5"],
  "port": 8787,
  "version": "1",
  "execEnabled": false
}
```

Copy the `payload` (Settings → **Pair a device**) and paste it into LLocal on
the phone (Settings → **Paste a pairing code**) to configure the URL + token in
one step. `POST /pairing/rotate` mints a fresh strong token; the rotated token
is persisted to `<LLOCAL_DATA_DIR>/server-token` (mode 0600) and **takes
precedence over `LLOCAL_SERVER_TOKEN`** on restart — the old token stops working
right away. The encode/decode logic is the shared, unit-tested core in
`src/shared/pairing.ts`.

## ⚠️ Security

This server can read/write a repo, talk to Ollama, and — if you enable it — **run
arbitrary commands on the host**. Treat the token like a password.

- **Always set a long, random `LLOCAL_SERVER_TOKEN`.** The server refuses to start without one.
- Prefer running it on a trusted LAN or behind a VPN/Tailscale, not the open internet. If you must expose it, put it behind HTTPS (a reverse proxy) and a firewall. For remote access, **Tailscale** ([tailscale.com/download](https://tailscale.com/download)) or a **Cloudflare Tunnel** with Cloudflare Access ([docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)) keep the server off the public internet while still reachable from your phone. The app's Settings → **Remote access** section walks through both.
- Rotate the token from the app (Settings → Pair a device → **Rotate token**) if you ever suspect it leaked; the old token is invalidated immediately.
- `/exec` is **disabled by default**. Enable it only if you understand that anyone
  with the token can run commands as the server's user. Use `LLOCAL_EXEC_ALLOWLIST`
  to restrict which commands are permitted, and run the server as a low-privilege user.
- Path inputs for RAG delete and Git file access are constrained to the data / repo
  directories to prevent traversal, but the exec endpoint is intentionally powerful —
  scope it with the allowlist and OS permissions.
