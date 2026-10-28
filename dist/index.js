import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { PLUGIN_ID, register } from './guard.js';
export default definePluginEntry({
    id: PLUGIN_ID,
    name: 'Media Guard',
    description: 'Blocks a message that names a remote media URL.',
    register,
});
