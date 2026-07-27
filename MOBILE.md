# LLocal on iOS (and the web build)

This document explains how the mobile port works, how to run it, and — since
Apple is restrictive — how to actually get it onto an iPhone.

## How it works

LLocal's UI is already a browser app: chat talks to Ollama over HTTP and chats
are stored in the WebView's IndexedDB. The desktop app only needs Electron for
things a phone can't do anyway. So the port keeps **one shared renderer** and
moves the native pieces to a **companion server** that runs on the Ollama host.

```
┌─ iOS app (Capacitor + the SAME React renderer) ─┐
│  chat + history (IndexedDB), settings, UI       │
│  window.api → HTTP adapter (mobile)             │
└───────────────┬─────────────────────────────────┘
    chat/models  │ (direct HTTP or /ollama proxy)   native │ (HTTPS + token)
                 ▼                                          ▼
        ┌──────────────────┐              ┌────────────────────────────────┐
        │  Ollama server    │◄────────────│  Companion server (server/)      │
        │  (remote, by IP)  │  embeddings  │  RAG · web search · TTS          │
        └──────────────────┘              │  Git (GitHub) · command exec      │
                                          └────────────────────────────────┘
```

- **Desktop is unchanged.** Electron still uses its preload IPC bridge and a
  local Ollama.
- On mobile/web, `src/renderer/src/main.tsx` installs an HTTP implementation of
  `window.api` (`src/renderer/src/platform/httpApi.ts`) and the Ollama host
  becomes configurable (`src/renderer/src/platform/config.ts`).
- The heavy feature logic lives once and is shared: `src/shared/rag-core.ts` is
  used by both the Electron main process and the companion server.

## Configure it

In the app: **Settings → Server & Repository**

- **Ollama base URL** — e.g. `http://192.168.1.10:11434` (or the companion
  server's `/ollama` proxy URL to avoid CORS).
- **Companion server URL + token** — e.g. `http://192.168.1.10:8787`.
- **GitHub owner / repo / branch / token** — the external repo you edit instead
  of local files.

**Settings → Repo & Console** lets you clone/pull the repo, edit + commit + push
files, and run commands on the host (unzip, build, …) — all on the server, so no
code lives on the phone.

### CORS / networking notes

Ollama rejects cross-origin browser requests by default. Either:

- start Ollama with `OLLAMA_ORIGINS=*` (simplest on a personal LAN), **or**
- point the app's Ollama URL at the companion server's `/ollama` proxy, which
  adds the token and sidesteps CORS entirely.

iOS blocks plaintext HTTP by default (App Transport Security). For a LAN IP you
either add an ATS exception in Xcode (Info.plist) or put the server behind HTTPS
(a reverse proxy / Tailscale).

## Run the companion server

See [`server/README.md`](server/README.md). Short version, on the Ollama host:

```bash
npm install                 # repo root (provides langchain/faiss/kokoro/etc.)
cd server && npm install
cp .env.example .env        # set LLOCAL_SERVER_TOKEN
npm start                   # listens on :8787
ollama pull all-minilm      # embedding model used by RAG / web search
```

## Build & run the iOS app

Requires a **Mac with Xcode** (Apple only allows iOS builds on macOS). The
native `ios/` project is already committed (with an ATS exception for local-network
HTTP pre-set in `Info.plist`), so you don't need to run `cap add ios` yourself.

```bash
npm install
sudo gem install cocoapods  # once, if you don't have CocoaPods
npm run cap:ios             # build:web + cap sync (runs pod install) + open Xcode
```

Then in Xcode select your team under Signing & Capabilities and press ▶ to run on
a simulator or a connected device.

> If you ever need to regenerate the native project from scratch, delete `ios/`
> and run `npm run cap:add:ios`.

You can also preview the web build in a desktop browser with `npm run dev:web`.

## Getting it onto your iPhone (Apple is restrictive)

For a personal tool that talks to your own server, pick whichever fits:

1. **Xcode + free Apple ID (simplest, free).** Plug in your iPhone, select it in
   Xcode, set a unique bundle id and your personal team under Signing, press ▶.
   The catch: a free account's signing cert lasts **7 days**, so you re-run from
   Xcode weekly. Fine for personal use.

2. **AltStore / SideStore (free, auto-refresh).** Sideload the `.ipa` and let
   AltStore re-sign it in the background so it doesn't expire every 7 days. Good
   if you don't want to open Xcode each week.

3. **Apple Developer Program ($99/yr) + TestFlight.** Provisioning lasts a year
   and TestFlight lets it "just stay installed" (up to 100 internal testers,
   minimal review). Best if you want to share it or stop babysitting the cert.

4. **App Store (overkill here).** A "connect to your own server" utility is
   allowed, but full review is unnecessary for personal use.

**Recommendation:** start with option 1 to try it, move to option 2 or 3 if the
weekly re-sign gets annoying.

### Sideloading with SideStore (step by step)

SideStore re-signs the app with your **own free Apple ID** on-device and refreshes it
in the background, so you don't need a paid account, a signing cert, or to re-run
Xcode every week. You just need to hand it an `.ipa`.

**1. Build an unsigned `.ipa`** (SideStore signs it at install time, so signing is
disabled here — no team/cert required):

```bash
npm run cap:sync   # build:web + copy the web bundle into the iOS project

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath ios/App/build-ipa CODE_SIGNING_ALLOWED=NO build

# package App.app into LLocal.ipa (repo root)
APP=ios/App/build-ipa/Build/Products/Release-iphoneos/App.app
rm -rf /tmp/llocal-ipa && mkdir -p /tmp/llocal-ipa/Payload
cp -R "$APP" /tmp/llocal-ipa/Payload/
(cd /tmp/llocal-ipa && zip -qr "$OLDPWD/LLocal.ipa" Payload)
```

**2. Set up SideStore** (one-time) by following the guide at
[sidestore.io](https://sidestore.io) — install the SideStore app on your iPhone and
pair it.

**3. Get `LLocal.ipa` onto the phone** — AirDrop it or save it into the Files app.

**4. Install it:** open SideStore → **My Apps → +** → pick `LLocal.ipa`. It signs with
your Apple ID and installs.

**5. Trust the profile:** first launch → **Settings → General → VPN & Device
Management** → trust your developer app.

Notes:

- Free Apple ID = a 7-day cert, but SideStore **auto-refreshes in the background**, so
  it won't expire on you (max **3** sideloaded apps per Apple ID).
- iOS can't run Ollama locally — point the app at your desktop's **companion server**
  under Server settings (see [Configure it](#configure-it) above).

## What is / isn't ported

| Feature | Mobile status |
|---------|---------------|
| Chat, streaming, model switch/pull | ✅ direct to remote Ollama |
| Chat history | ✅ IndexedDB in the WebView |
| Themes, markdown, mermaid, code blocks | ✅ shared renderer |
| RAG / knowledge base | ✅ via companion server (upload → embed on host) |
| Web search / URL scrape | ✅ via companion server |
| Text-to-speech | ✅ via companion server (kokoro-js on host) |
| Edit an external repo | ✅ Git routes on companion server |
| Run commands on the host | ✅ gated `/exec` on companion server |
| Local Ollama install/download | ➖ N/A (remote server) |
| Custom window titlebar | ➖ N/A (mobile) |
