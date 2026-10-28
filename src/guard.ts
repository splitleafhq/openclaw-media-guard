import { type MediaRules, isRecord, messageBlockReason } from './rules.ts';

export const PLUGIN_ID = 'media-guard';
export const DEFAULT_MXC_SERVERS: readonly string[] = ['matrix.org'];

export type GuardConfig = MediaRules;

export interface ToolCallEvent {
  toolName: string;
  params?: unknown;
}

export interface BlockResult {
  block: true;
  blockReason: string;
}

function strings(raw: unknown, key: string): string[] | undefined {
  const value = isRecord(raw) ? raw[key] : undefined;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : undefined;
}

/** `mxcServers` replaces the default when it holds at least one name; anything unreadable keeps the default. */
export function resolveConfig(raw: unknown): GuardConfig {
  const servers = strings(raw, 'mxcServers')?.map((s) => s.trim().toLowerCase());
  return {
    mxcServers: servers && servers.length > 0 ? servers : DEFAULT_MXC_SERVERS,
    extraMediaKeys: strings(raw, 'extraMediaKeys') ?? [],
  };
}

export function decide(event: ToolCallEvent, config: GuardConfig): BlockResult | undefined {
  const reason = messageBlockReason(event.toolName, event.params, config);
  return reason ? { block: true, blockReason: reason } : undefined;
}

export interface HookApi {
  pluginConfig?: unknown;
  on(name: 'before_tool_call', handler: (event: ToolCallEvent) => BlockResult | undefined, options: { priority: number }): void;
}

/**
 * Registers one `before_tool_call` handler. `{ block: true }` is terminal, and the host blocks the call when a handler
 * throws or times out (plugins/hooks/reference.md:93, 2026.10.8), so the guard fails closed.
 */
export function register(api: HookApi): void {
  const config = resolveConfig(api.pluginConfig);
  api.on('before_tool_call', (event) => decide(event, config), { priority: 100 });
}
