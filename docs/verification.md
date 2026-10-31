# Verification

## Checked

- **Unit tests** (`npm test`) cover every media key in the runtime's list with an http(s) URL, nested, array, `attachments` and JSON-text forms, mixed-case schemes, `MEDIA:` prefixes, local paths, `data:`, buffers, `mxc://` on the allowed and other servers, messages with no media, other tools, unreadable input, the refusal text, and the leak scan.
- **Typecheck** against the OpenClaw 2026.10.8 plugin SDK, in CI.
- **Copy install in OpenClaw 2026.10.8:** in an isolated state directory (`OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`), `plugins install <checkout> --force --accept-capabilities` then `plugins inspect media-guard --runtime --json` reports `status: loaded` from `dist/index.js` with `typedHooks: [{ before_tool_call, priority 100 }]`. Without `dist/`, an install fails: "requires compiled runtime output for TypeScript entry ./src/index.ts".

## Not yet checked on a live gateway

- That the hook fires for every message path an agent can take: the direct `message` tool, through Tool Search, and through Code Mode (from the docs, not run). Calls made outside an agent's tools, such as the `openclaw message` CLI, don't use the hook.
- The tool name the hook sees. The docs example uses `message` (`plugins/hooks/tool-policy.md:156`); no live call has been traced.
- That the gateway accepts an `mxc://` URI in a media field. The shared media loader has no `mxc` handling (`web-media-B7oSDJo7.mjs`); whether the Matrix plugin resolves it before then is unchecked.
- That the media loader strips `MEDIA:` twice and fetches `MEDIA:MEDIA:https://...`. Read from `web-media-B7oSDJo7.mjs:473`, `:481` and `:515`, not run.
- The Matrix server-name and media-id syntax is taken from the Matrix content-repository spec, not checked against a server.
- Whether other installed channel plugins add media keys not in the default list. Add them to `extraMediaKeys`.

## Not covered

- Links in the message text, and link previews a channel builds from them.
- Other tools that fetch URLs.

## Checking it on your gateway

1. Run `openclaw plugins inspect media-guard --runtime --json`. The plugin should be loaded, with `before_tool_call` in `typedHooks`.
2. Ask an agent to send a message with a media URL on the `.invalid` domain. Expect the block message and no outbound fetch.
3. Ask it to send a local file. Expect delivery.
