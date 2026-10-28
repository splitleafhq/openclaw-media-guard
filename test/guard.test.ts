import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type BlockResult, type HookApi, DEFAULT_MXC_SERVERS, decide, register, resolveConfig } from '../src/guard.ts';

test('with no usable config the default homeserver applies and no extra keys are read', () => {
  const expected = { mxcServers: DEFAULT_MXC_SERVERS, extraMediaKeys: [] };
  assert.deepEqual(resolveConfig(undefined), expected);
  assert.deepEqual(resolveConfig({}), expected);
  assert.deepEqual(resolveConfig({ mxcServers: 'home.example', extraMediaKeys: 3 }), expected);
  assert.deepEqual(resolveConfig({ mxcServers: [] }), expected);
  assert.deepEqual(resolveConfig({ mxcServers: ['', 7] }), expected);
});

test('configured servers replace the default, trimmed and lowercased; extra keys are kept', () => {
  assert.deepEqual(resolveConfig({ mxcServers: [' Home.Example ', 'b.example:8448'], extraMediaKeys: ['cover', ''] }), {
    mxcServers: ['home.example', 'b.example:8448'],
    extraMediaKeys: ['cover'],
  });
});

test('decide blocks a remote media URL with a reason and leaves other calls alone', () => {
  const config = resolveConfig({});
  const result = decide({ toolName: 'message', params: { action: 'send', media: 'https://example.com/a.png' } }, config);
  assert.equal(result?.block, true);
  assert.match(result?.blockReason ?? '', /^Blocked: media/u);
  assert.equal(decide({ toolName: 'message', params: { action: 'send', media: '/tmp/a.png' } }, config), undefined);
  assert.equal(decide({ toolName: 'cron', params: { media: 'https://example.com/a.png' } }, config), undefined);
});

test('register adds one before_tool_call handler at priority 100 that uses the plugin config', () => {
  const calls: { name: string; priority: number; handler: (e: { toolName: string; params?: unknown }) => BlockResult | undefined }[] = [];
  const api: HookApi = {
    pluginConfig: { mxcServers: ['home.example'] },
    on(name, handler, options) {
      calls.push({ name, priority: options.priority, handler });
    },
  };
  register(api);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, 'before_tool_call');
  assert.equal(calls[0]?.priority, 100);
  const handler = calls[0]?.handler;
  assert.equal(handler?.({ toolName: 'message', params: { media: 'mxc://home.example/abc' } }), undefined);
  assert.equal(handler?.({ toolName: 'message', params: { media: 'mxc://matrix.org/abc' } })?.block, true);
});
