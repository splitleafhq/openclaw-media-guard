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
export const MEDIA_KEYS: readonly string[] = [
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
export const STRUCTURED_KEYS: readonly string[] = [...MEDIA_KEYS, 'url'];

const ATTACHMENTS_KEY = 'attachments';
const MAX_DEPTH = 32;

/**
 * Top-level params the runtime parses from JSON text, once, before use (`parseJsonMessageParam`,
 * message-action-runner-Bjmjjet2.mjs:1861-1863, OpenClaw 2026.10.8). Any other string is sent or stored as text.
 */
const JSON_TEXT_KEYS: ReadonlySet<string> = new Set(['presentation', 'delivery', 'interactive']);

export interface MediaRules {
  mxcServers: readonly string[];
  extraMediaKeys: readonly string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The runtime reads `mediaUrl` and `media_url` alike; case and hyphens are folded too so a spelling can't dodge. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[_\s-]/gu, '');
}

/** Names the field and the kind of source, never the value: this text reaches the gateway log and the model. */
export function refusal(field: string, why: string): string {
  return (
    `Blocked: media field "${field}" ${why}. A message may only attach a local file, a data: URI, a base64 buffer, ` +
    `or an mxc:// URI on an allowed Matrix server. Remote URLs are not allowed; use a local file or ask the owner.`
  );
}

const SCHEME = /^([a-z][a-z0-9+.-]*):/iu;
const MXC = /^mxc:\/\/([^/?#@\\\s]+)\/[A-Za-z0-9_-]+$/iu;

/**
 * The runtime strips a leading `MEDIA:` before it looks at the scheme (web-media-B7oSDJo7.mjs:99-102), and does it twice
 * (:473, :481), so every prefix is stripped here.
 */
function stripDirective(value: string): string {
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
export function mediaRefusal(raw: string, rules: MediaRules, field = 'media'): string | undefined {
  const value = stripDirective(raw).trimEnd();
  if (value === '') {
    return undefined;
  }
  if (value.startsWith('\\\\')) {
    return refusal(field, 'is a network path');
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
      return refusal(field, 'is not a valid mxc:// content URI');
    }
    return rules.mxcServers.includes(server) ? undefined : refusal(field, 'is on a Matrix server that is not allowed');
  }
  if (scheme === 'file') {
    return /^file:(?:\/\/(?:localhost)?\/|\/(?!\/))/iu.test(value) ? undefined : refusal(field, 'is a file: URL on another host');
  }
  if (scheme === 'media') {
    return undefined;
  }
  return refusal(field, 'is a remote or unknown source, which the gateway may fetch from the host');
}

interface Walk {
  rules: MediaRules;
  keys: ReadonlySet<string>;
  structured: ReadonlySet<string>;
  /** The media key being walked: from the known key list, so it carries no model text. */
  field: string;
}

function walk(value: unknown, state: Walk, depth: number, inMedia: boolean, inStructured: boolean): string | undefined {
  if (depth > MAX_DEPTH) {
    return 'Blocked: the message input is nested too deeply to check.';
  }
  if (typeof value === 'string') {
    return inMedia ? mediaRefusal(value, state.rules, state.field) : undefined;
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
      if (media) {
        state.field = name;
      }
      const found = walk(item, state, depth + 1, media, structured);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** The params as the runtime reads them: its JSON text params parsed, other values as given. */
function parseJsonTextParams(params: Record<string, unknown>): Record<string, unknown> {
  // Spread keeps an own __proto__ key as a property; assigning it onto {} would set the prototype and hide it from the walk.
  const parsed: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(params)) {
    if (JSON_TEXT_KEYS.has(normalizeKey(key)) && typeof value === 'string') {
      parsed[key] = parseJsonText(value);
    }
  }
  return parsed;
}

/** Invalid JSON fails the call in the runtime ("must be valid JSON"), so nothing is fetched and it passes here. */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return undefined;
  }
}

/** A reason to block this message call, or undefined to let it through. Input it can't read is blocked. */
export function messageBlockReason(toolName: string, params: unknown, rules: MediaRules): string | undefined {
  const name = toolName.trim().toLowerCase();
  if (name !== MESSAGE_TOOL && !name.endsWith(`:${MESSAGE_TOOL}`)) {
    return undefined;
  }
  if (!isRecord(params)) {
    return 'Blocked: the message call has no readable parameters.';
  }
  const extra = rules.extraMediaKeys.map(normalizeKey);
  const state: Walk = {
    rules,
    keys: new Set([...MEDIA_KEYS, ...extra]),
    structured: new Set([...STRUCTURED_KEYS, ...extra]),
    field: 'media',
  };
  return walk(parseJsonTextParams(params), state, 0, false, false);
}
