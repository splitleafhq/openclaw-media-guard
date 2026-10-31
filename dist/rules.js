/** The message tool's name as `before_tool_call` sees it (plugins/hooks/tool-policy.md, 2026.10.8). */
export const MESSAGE_TOOL = 'message';
/**
 * Media-source keys of the message tool, normalized (see `normalizeKey`). OpenClaw 2026.10.8:
 * - `BASE_ACTION_MEDIA_SOURCE_PARAM_KEYS` (media, path, filePath, mediaUrl, fileUrl, image) and the `mediaUrls` array,
 *   dist/message-action-normalization-CYaa9UED.mjs:703-710 and :789;
 * - the Matrix plugin's `set-profile` keys (avatarUrl, avatarPath), `MATRIX_PROFILE_MEDIA_SOURCE_PARAMS` in
 *   @openclaw/matrix 2026.10.8, dist/.setup/channel-DfdH7wnt.mjs:61.
 * Channel plugins declare theirs through `describeMessageTool().mediaSourceParams`; `extraMediaKeys` adds more.
 */
export const MEDIA_KEYS = [
    'media',
    'path',
    'filepath',
    'mediaurl',
    'fileurl',
    'image',
    'mediaurls',
    'avatarurl',
    'avatarpath',
];
/**
 * Inside `attachments` items (and inside any media key's object value) `url` is a source too:
 * `STRUCTURED_ATTACHMENT_MEDIA_SOURCE_PARAM_KEYS`, same file, :711-718. A `url` elsewhere, such as a link button, isn't.
 */
export const STRUCTURED_KEYS = [...MEDIA_KEYS, 'url'];
const ATTACHMENTS_KEY = 'attachments';
const MAX_DEPTH = 32;
const MAX_JSON_PARSES = 64;
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** The runtime reads `mediaUrl` and `media_url` alike; case and hyphens are folded too so a spelling can't dodge. */
export function normalizeKey(key) {
    return key.toLowerCase().replaceAll(/[_\s-]/gu, '');
}
export function refusal(source, why) {
    const shown = source.length > 80 ? `${source.slice(0, 80)}...` : source;
    return (`Blocked: media "${shown}" ${why}. A message may only attach a local file, a data: URI, a base64 buffer, ` +
        `or an mxc:// URI on an allowed Matrix server. Remote URLs are not allowed; use a local file or ask the owner.`);
}
const SCHEME = /^([a-z][a-z0-9+.-]*):/iu;
const MXC = /^mxc:\/\/([^/?#@\\\s]+)\/[A-Za-z0-9_-]+$/iu;
/**
 * The runtime strips a leading `MEDIA:` before it looks at the scheme (web-media-B7oSDJo7.mjs:99-102), and does it twice
 * (:473, :481), so every prefix is stripped here.
 */
function stripDirective(value) {
    let current = value.replace(/^[\s\p{Cc}]+/u, '');
    while (!/^media:\/\//iu.test(current)) {
        const next = current.replace(/^media\s*:\s*/iu, '').replace(/^[\s\p{Cc}]+/u, '');
        if (next === current) {
            break;
        }
        current = next;
    }
    return current;
}
/** A reason this media string is refused, or undefined when it is a local path, data: URI or an allowed mxc:// URI. */
export function mediaRefusal(raw, rules) {
    const value = stripDirective(raw).trimEnd();
    if (value === '') {
        return undefined;
    }
    if (value.startsWith('\\\\')) {
        return refusal(raw, 'is a network path');
    }
    const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
    if (scheme === undefined || scheme.length === 1) {
        return undefined;
    }
    if (scheme === 'data') {
        return undefined;
    }
    if (scheme === 'mxc') {
        const server = MXC.exec(value)?.[1]?.toLowerCase();
        if (server === undefined) {
            return refusal(raw, 'is not a valid mxc:// content URI');
        }
        return rules.mxcServers.includes(server) ? undefined : refusal(raw, `is on a Matrix server that is not allowed (${server})`);
    }
    if (scheme === 'file') {
        return /^file:(?:\/\/(?:localhost)?\/|\/(?!\/))/iu.test(value) ? undefined : refusal(raw, 'is a file: URL on another host');
    }
    if (scheme === 'media') {
        return undefined;
    }
    return refusal(raw, `is a remote or unknown "${scheme}:" source, which the gateway may fetch from the host`);
}
function walk(value, state, depth, inMedia, inStructured) {
    if (depth > MAX_DEPTH) {
        return 'Blocked: the message input is nested too deeply to check.';
    }
    if (typeof value === 'string') {
        if (inMedia) {
            return mediaRefusal(value, state.rules);
        }
        return walkJsonText(value, state, depth, inStructured);
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = walk(item, state, depth + 1, inMedia, inStructured);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
    if (isRecord(value)) {
        for (const [key, item] of Object.entries(value)) {
            const name = normalizeKey(key);
            const media = state.keys.has(name) || (inStructured && state.structured.has(name)) || (inMedia && name === 'url');
            const structured = inStructured || inMedia || name === ATTACHMENTS_KEY;
            const found = walk(item, state, depth + 1, media, structured);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}
/** Some message params arrive as JSON text and are parsed by the runtime (message-action-runner-Bjmjjet2.mjs:1861-1863). */
function walkJsonText(text, state, depth, inStructured) {
    const trimmed = text.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return undefined;
    }
    state.parses += 1;
    if (state.parses > MAX_JSON_PARSES) {
        return 'Blocked: the message input has too many embedded JSON values to check.';
    }
    return walk(parsed, state, depth + 1, false, inStructured);
}
/** A reason to block this message call, or undefined to let it through. Input it can't read is blocked. */
export function messageBlockReason(toolName, params, rules) {
    const name = toolName.trim().toLowerCase();
    if (name !== MESSAGE_TOOL && !name.endsWith(`:${MESSAGE_TOOL}`)) {
        return undefined;
    }
    if (!isRecord(params)) {
        return 'Blocked: the message call has no readable parameters.';
    }
    const extra = rules.extraMediaKeys.map(normalizeKey);
    const state = {
        rules,
        keys: new Set([...MEDIA_KEYS, ...extra]),
        structured: new Set([...STRUCTURED_KEYS, ...extra]),
        parses: 0,
    };
    return walk(params, state, 0, false, false);
}
