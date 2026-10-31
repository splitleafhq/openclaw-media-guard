# How it works

Checked against OpenClaw 2026.10.8.

## The hook

The plugin registers one `before_tool_call` handler at priority 100 (`plugins/hooks/tool-policy.md`). For a call it blocks, it returns `{ block: true, blockReason }`, which is terminal: lower-priority handlers are skipped and the tool doesn't run. OpenClaw also blocks the call when a `before_tool_call` handler throws or times out (`plugins/hooks/reference.md:93`). Tool Search and Code Mode keep plugin `before_tool_call` hooks for the calls they make (`tools/tool-search.md:315-323`).

The handler acts when the tool name is `message` (the name used in `plugins/hooks/tool-policy.md:156`), ignoring case, or ends in `:message`. No conversation-access grant is needed.

## Which fields it reads

The runtime's own media-source keys (`dist/message-action-normalization-CYaa9UED.mjs`):

| Keys | Source |
| --- | --- |
| `media`, `path`, `filePath`, `mediaUrl`, `fileUrl`, `image` | `BASE_ACTION_MEDIA_SOURCE_PARAM_KEYS`, lines 703-710 |
| `mediaUrls` (array; `media_urls` alias) | `collectActionMediaSourceHints`, line 789 |
| `url`, plus the keys above, inside `attachments` items | `STRUCTURED_ATTACHMENT_MEDIA_SOURCE_PARAM_KEYS`, lines 711-718 |
| `avatarUrl`, `avatarPath` | Matrix plugin 2026.10.8, `MATRIX_PROFILE_MEDIA_SOURCE_PARAMS`, `dist/.setup/channel-DfdH7wnt.mjs:61` |

Channel plugins declare their own through `describeMessageTool().mediaSourceParams` (`plugins/sdk-channel-plugins/status-and-media.md`); list any others in `extraMediaKeys`.

The runtime reads `mediaUrl` and `media_url` alike (`param-key-BvJDza_v.mjs:7-11`), so keys are matched ignoring case, underscores and hyphens, at any depth. The whole input is walked: nested objects, arrays, and JSON text params the runtime parses (`message-action-runner-Bjmjjet2.mjs:1861-1863`). `buffer` is base64, not a source to fetch, so it passes.

The media loader strips a leading `MEDIA:` and surrounding whitespace (`web-media-B7oSDJo7.mjs:99-102`) twice before it looks at the scheme (`:473`, `:481`), then fetches anything starting `http://` or `https://` (`:515`, `url-protocol-De2aQ55s.mjs:2`), so `MEDIA:MEDIA:https://...` is fetched. The plugin strips every leading `MEDIA:` prefix, so it refuses that and any longer chain.

## What passes

A value with no scheme (a path), a one-letter scheme (a Windows drive), `data:`, `media://`, `file:` on this host, and `mxc://<server>/<id>` where `<server>` is in `mxcServers`. The mxc server must match exactly (name and port), the media id must be one segment of letters, digits, `_` and `-`. Anything else is blocked, so a new scheme added by an upgrade stays blocked until allowed here.

Local paths are not checked against roots: the gateway enforces its own local-roots policy on them.

## Failing closed

- Parameters that aren't an object are blocked.
- Input nested deeper than 32 levels, or holding more than 64 JSON text values, is blocked.
