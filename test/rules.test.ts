import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_MXC_SERVERS } from '../src/guard.ts';
import { MEDIA_KEYS, type MediaRules, messageBlockReason, normalizeKey } from '../src/rules.ts';

const rules: MediaRules = { mxcServers: DEFAULT_MXC_SERVERS, extraMediaKeys: [] };
const check = (params: unknown, r: MediaRules = rules) => messageBlockReason('message', params, r);
const send = (extra: Record<string, unknown>) => ({ action: 'send', to: 'room', message: 'hi', ...extra });

// The runtime's own spellings of its media-source keys (BASE_ACTION_MEDIA_SOURCE_PARAM_KEYS plus the mediaUrls array).
const RUNTIME_KEYS = ['media', 'path', 'filePath', 'mediaUrl', 'fileUrl', 'image', 'mediaUrls', 'media_urls'];
const CHANNEL_KEYS = ['avatarUrl', 'avatarPath', 'avatar_url'];
const REMOTE = 'https://example.com/a.png?token=secret';

test('the key list covers every runtime spelling and the Matrix profile keys', () => {
  for (const key of [...RUNTIME_KEYS, ...CHANNEL_KEYS]) {
    assert.ok(MEDIA_KEYS.includes(normalizeKey(key)), key);
  }
});

test('every media key with an http(s) URL is refused', () => {
  for (const key of [...RUNTIME_KEYS, ...CHANNEL_KEYS]) {
    for (const url of [REMOTE, 'http://example.com/a.png']) {
      assert.match(check(send({ [key]: url })) ?? '', /^Blocked: media/u, `${key} ${url}`);
    }
  }
});

test('a media key holding a remote URL is refused however the key is cased or spelled', () => {
  for (const key of ['MEDIAURL', 'Media_Url', 'media-url', 'FILE_PATH', 'Image']) {
    assert.ok(check(send({ [key]: REMOTE })), key);
  }
});

test('an mediaUrls array is refused when any one item is remote', () => {
  assert.ok(check(send({ mediaUrls: ['/tmp/a.png', REMOTE] })));
  assert.ok(check(send({ media_urls: [REMOTE] })));
  assert.equal(check(send({ mediaUrls: ['/tmp/a.png', '/tmp/b.png'] })), undefined);
});

test('attachments items are refused for every key they accept, including url', () => {
  for (const key of ['media', 'mediaUrl', 'path', 'filePath', 'fileUrl', 'url']) {
    assert.ok(check(send({ attachments: [{ filename: 'a', [key]: REMOTE }] })), key);
    assert.ok(check(send({ attachments: [{ filename: 'ok', path: '/tmp/ok.png' }, { [key]: REMOTE }] })), key);
  }
});

test('a url outside attachments is not a media source (a link button is not fetched)', () => {
  const presentation = { blocks: [{ type: 'buttons', buttons: [{ label: 'Docs', action: { type: 'url', url: REMOTE } }] }] };
  assert.equal(check(send({ presentation })), undefined);
});

test('deeply nested media keys and objects under a media key are refused', () => {
  assert.ok(check(send({ extra: { deep: [{ more: { mediaUrl: REMOTE } }] } })));
  assert.ok(check(send({ media: { url: REMOTE } })));
  assert.ok(check(send({ media: [{ url: REMOTE }] })));
});

test('JSON text params are read: the runtime parses them before use', () => {
  assert.ok(check(send({ presentation: JSON.stringify({ image: REMOTE }) })));
  assert.ok(check(send({ interactive: JSON.stringify([{ nested: { mediaUrl: REMOTE } }]) })));
  assert.ok(check(send({ delivery: JSON.stringify({ media: REMOTE }) })));
  assert.equal(check(send({ presentation: '{not json' })), undefined);
});

test('JSON-looking text in any other param is not parsed: the runtime sends it as text', () => {
  const json = JSON.stringify({ image: REMOTE });
  assert.equal(check(send({ message: json })), undefined);
  assert.equal(check(send({ caption: json })), undefined);
  assert.equal(check(send({ presentation: { title: json } })), undefined);
  assert.equal(check(send({ presentation: JSON.stringify({ title: json }) })), undefined);
});

test('an own __proto__ param holding a media URL is still refused', () => {
  assert.ok(check(JSON.parse(`{"action":"send","__proto__":{"media":"${REMOTE}"}}`)));
});

test('a scheme in mixed case, with leading space or one or more MEDIA: prefixes is still refused', () => {
  for (const url of ['HTTPS://example.com/a', 'HtTp://example.com/a', '  https://example.com/a', '\nhttp://example.com/a', 'MEDIA:https://example.com/a', 'media: HTTP://example.com/a', '\u0001https://example.com/a', 'MEDIA:MEDIA:https://example.com/a', 'MEDIA: media:MEDIA:http://example.com/a']) {
    assert.ok(check(send({ media: url })), JSON.stringify(url));
  }
});

test('other remote or unknown schemes and network paths fail closed', () => {
  for (const url of ['ftp://example.com/a', 's3://bucket/key', 'gopher://example.com', 'javascript:alert(1)', 'file://example.com/share/a', '\\\\host\\share\\a.png']) {
    assert.ok(check(send({ media: url })), url);
  }
});

test('local paths, data: URIs, a base64 buffer and the local file forms pass', () => {
  for (const value of ['/tmp/a.png', './a.png', 'a.png', '~/a.png', 'C:\\pics\\a.png', 'dir/with:colon.png', 'file:///tmp/a.png', 'file://localhost/tmp/a.png', 'media://inbound/abc.png', 'DATA:image/png;base64,AAAA', 'data:text/plain,hello', '']) {
    assert.equal(check(send({ media: value })), undefined, value);
  }
  assert.equal(check(send({ buffer: 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==', filename: 'a.png' })), undefined);
});

test('an mxc URI on the owner server passes; another server is refused', () => {
  assert.equal(check(send({ media: 'mxc://matrix.org/AbC_123-x' })), undefined);
  assert.equal(check(send({ media: 'MXC://Matrix.ORG/AbC' })), undefined);
  assert.equal(check(send({ attachments: [{ mediaUrl: 'mxc://matrix.org/AbC' }] })), undefined);
  assert.match(check(send({ media: 'mxc://evil.example/AbC' })) ?? '', /not allowed \(evil\.example\)/u);
  assert.ok(check(send({ media: 'mxc://matrix.org.evil.example/AbC' })));
  assert.ok(check(send({ media: ['mxc://matrix.org', '@', 'evil.example/AbC'].join('') })));
  assert.ok(check(send({ media: 'mxc://matrix.org/AbC/../x' })));
  assert.ok(check(send({ media: 'mxc://matrix.org' })));
});

test('a configured homeserver replaces the default', () => {
  const own: MediaRules = { mxcServers: ['home.example'], extraMediaKeys: [] };
  assert.equal(check(send({ media: 'mxc://home.example/AbC' }), own), undefined);
  assert.ok(check(send({ media: 'mxc://matrix.org/AbC' }), own));
});

test('extra media keys from a channel plugin are checked at any depth', () => {
  const extra: MediaRules = { mxcServers: DEFAULT_MXC_SERVERS, extraMediaKeys: ['cover_Image'] };
  assert.equal(check(send({ coverImage: REMOTE })), undefined);
  assert.ok(check(send({ coverImage: REMOTE }), extra));
  assert.ok(check(send({ nested: { cover_image: REMOTE } }), extra));
});

test('a message with no media passes untouched, even with a URL in the text', () => {
  assert.equal(check(send({})), undefined);
  assert.equal(check(send({ message: 'see https://example.com/page' })), undefined);
  assert.equal(check({ action: 'read', to: 'room' }), undefined);
});

test('other tools are never checked, and the message tool is matched however it is namespaced', () => {
  assert.equal(messageBlockReason('web_fetch', { media: REMOTE }, rules), undefined);
  assert.equal(messageBlockReason('exec', { mediaUrl: REMOTE }, rules), undefined);
  assert.ok(messageBlockReason('Message', { media: REMOTE }, rules));
  assert.ok(messageBlockReason('openclaw:core:message', { media: REMOTE }, rules));
});

test('unreadable or over-nested message input is refused', () => {
  for (const params of [undefined, null, 'media', ['x'], 3]) {
    assert.match(check(params) ?? '', /no readable parameters/u);
  }
  let deep: Record<string, unknown> = { ok: 1 };
  for (let i = 0; i < 40; i += 1) {
    deep = { next: deep };
  }
  assert.match(check(send({ deep })) ?? '', /nested too deeply/u);
});

test('the refusal tells the agent what was blocked and what to do instead', () => {
  const reason = check(send({ mediaUrl: REMOTE })) ?? '';
  assert.match(reason, /^Blocked: media "https:\/\/example\.com\/a\.png\?token=secret"/u);
  assert.match(reason, /local file/u);
  assert.match(reason, /ask the owner/u);
  const long = check(send({ media: `https://example.com/${'a'.repeat(300)}` })) ?? '';
  assert.ok(long.length < 400, 'a long URL is truncated in the refusal');
});
