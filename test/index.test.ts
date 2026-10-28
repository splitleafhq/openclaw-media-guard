import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import entry from '../src/index.ts';
import { PLUGIN_ID } from '../src/guard.ts';

test('the plugin entry loads with the pinned SDK and carries the plugin id', () => {
  assert.equal(entry.id, PLUGIN_ID);
  assert.equal(typeof entry.register, 'function');
});
