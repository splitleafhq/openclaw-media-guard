# Changelog

## Unreleased

- Parses JSON text only in the top-level `presentation`, `delivery` and `interactive` params, as the runtime does. JSON-looking message text, which the runtime sends as text, is no longer blocked.
- Ships compiled `dist/`: an install runs npm without scripts, so it can't build one. `openclaw.runtimeExtensions` points at `./dist/index.js`, which OpenClaw loads from a copy or a load path. CI checks `dist/` matches a fresh build.
- Strips every leading `MEDIA:` prefix before checking the scheme: OpenClaw strips it twice, so `MEDIA:MEDIA:https://...` was let through and fetched.

First version, built and tested against OpenClaw 2026.10.8.

- Blocks `message` calls whose media-source fields name a remote URL or an unknown scheme.
- Allows local paths, `data:` URIs, base64 buffers and `mxc://` URIs on `mxcServers` (default `matrix.org`).
- Blocks message calls it can't read.
