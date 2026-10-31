# openclaw-media-guard

An [OpenClaw](https://docs.openclaw.ai) plugin (id `media-guard`) that stops agents from putting a remote media URL in a `message` tool call.

When an agent names a remote media URL in a message, the gateway fetches it itself, on the host, outside any agent sandbox. The host, path and query of that URL leave the machine, and OpenClaw 2026.10.8 has no config switch to stop it. This plugin refuses the call before it runs. Local files, `data:` URIs, base64 buffers and `mxc://` URIs on an allowed Matrix server still work.

**Status:** experimental. Built and tested against OpenClaw 2026.10.8. Not published on ClawHub or npm; install it from source. What has and hasn't been checked on a live gateway is in [docs/verification.md](docs/verification.md).

## What it blocks

A `message` call from an agent with a media-source field that isn't one of the allowed forms:

```text
Tool "message" was blocked before execution: Blocked: media "https://example.com/a.png?token=..." is a remote or unknown "https:" source, which the gateway may fetch from the host. A message may only attach a local file, a data: URI, a base64 buffer, or an mxc:// URI on an allowed Matrix server. Remote URLs are not allowed; use a local file or ask the owner.
```

| Source | Result |
| --- | --- |
| Local path, `file:///path`, `media://` (inbound store) | allowed |
| `data:` URI, `buffer` (base64) | allowed |
| `mxc://<allowed server>/<id>` | allowed |
| `mxc://` on another server, malformed `mxc://` | blocked |
| `http`, `https`, `ftp`, any other scheme, `file://<other host>`, `\\host\share` | blocked |

It reads every media key however it is cased or nested, `attachments` items, `mediaUrls` arrays, and the JSON text params the runtime parses. Details are in [docs/how-it-works.md](docs/how-it-works.md).

## Install

Pinned to a tag or commit of a clone:

```sh
openclaw plugins install git:file:///path/to/openclaw-media-guard@<tag or commit> --force --accept-capabilities
openclaw plugins enable media-guard
openclaw plugins inspect media-guard --runtime --json
```

Or linked to a checkout: `openclaw plugins install --link --force /path/to/openclaw-media-guard`.

- OpenClaw loads the committed `dist/` through `openclaw.runtimeExtensions`, from a git install, a copy, a load path or `--link` alike (`docs/plugins/sdk-entrypoints/package-entries.md:36-38`, 2026.10.8), checked on 2026.10.8: an install runs npm without scripts, so nothing is built then, and a change to `src/` runs only after `npm run build`.
- `--force` confirms a source that isn't on ClawHub.
- Default allowed server: `matrix.org`. To set yours: `openclaw config set plugins.entries.media-guard.config '{"mxcServers":["<your homeserver name>"]}' --strict-json`. To read extra channel keys, add `"extraMediaKeys":["<param name>"]`. Config edits apply without a restart.
- `inspect` should show the plugin as loaded, with `before_tool_call` in `typedHooks`.

To turn it off, run `openclaw plugins disable media-guard`.

## Bounds

- **Scoped:** only `message` calls, and only their media-source fields. Every other tool call passes untouched.
- **Fails closed:** a message call it can't read is blocked, and OpenClaw blocks the call if the handler throws or times out.
- **Not covered:** links in the message text, link previews the channel builds from them, and other tools that fetch URLs (`web_fetch`, `exec`). Messages sent outside an agent's tools (the `openclaw message` CLI, Gateway RPC) never reach the hook.

## Develop

Requires Node 24.16 or later.

```sh
npm ci --ignore-scripts
npm run lint && npm run typecheck && npm test
npm run build
```

Commit `dist/` with any change to `src/`; CI fails when it doesn't match a fresh build.

Run the checks in a separate clone, or delete `node_modules/` from a checkout you've installed with `--link`: OpenClaw maps `openclaw/plugin-sdk/*` to the gateway's own install, so a second copy can drift from the host.

## License

[MIT](LICENSE)
