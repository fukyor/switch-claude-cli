import type { Provider } from '../types/index.js';
import { normalizeProxyUrl } from './proxy-utils.js';

export interface EnvEntry {
  key: string;
  value: string;
}

/**
 * 构建代理相关环境变量
 */
export function buildProxyEnvEntries(proxy?: string): EnvEntry[] {
  if (!proxy) {
    return [];
  }

  const normalizedProxy = normalizeProxyUrl(proxy);

  return [
    { key: 'HTTP_PROXY', value: normalizedProxy },
    { key: 'HTTPS_PROXY', value: normalizedProxy },
    { key: 'ALL_PROXY', value: normalizedProxy },
    { key: 'http_proxy', value: normalizedProxy },
    { key: 'https_proxy', value: normalizedProxy },
    { key: 'all_proxy', value: normalizedProxy },
  ];
}

/**
 * 构建 Claude 模式自身需要的环境变量
 */
export function buildClaudeEnvEntries(provider: Provider): EnvEntry[] {
  const entries: EnvEntry[] = [
    { key: 'ANTHROPIC_BASE_URL', value: provider.baseUrl },
    { key: 'ANTHROPIC_AUTH_TOKEN', value: provider.key },
  ];

  if (provider.defaultHaikuModel) {
    entries.push({ key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: provider.defaultHaikuModel });
  }
  if (provider.defaultSonnetModel) {
    entries.push({ key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: provider.defaultSonnetModel });
  }
  if (provider.defaultOpusModel) {
    entries.push({ key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: provider.defaultOpusModel });
  }

  return entries;
}

/**
 * 将自定义字段转换为环境变量条目
 */
export function buildCustomEnvEntries(customFields: Record<string, string>): EnvEntry[] {
  return Object.entries(customFields).map(([key, value]) => ({ key, value }));
}

/**
 * 为 cmd.exe 构建环境变量设置命令
 */
export function buildWindowsEnvCommand(envEntries: EnvEntry[], commandName: string): string {
  if (envEntries.length === 0) {
    return commandName;
  }

  const envPrefix = envEntries
    .map(({ key, value }) => `set "${key}=${escapeWindowsEnvValue(value)}"`)
    .join(' && ');

  return `${envPrefix} && ${commandName}`;
}

/**
 * 为 POSIX shell 构建环境变量设置命令
 */
export function buildPosixEnvCommand(envEntries: EnvEntry[], commandName: string): string {
  if (envEntries.length === 0) {
    return commandName;
  }

  const envPrefix = envEntries
    .map(({ key, value }) => `export ${key}='${escapePosixEnvValue(value)}'`)
    .join('; ');

  return `${envPrefix}; ${commandName}`;
}

function escapeWindowsEnvValue(value: string): string {
  return value.replace(/"/g, '^"').replace(/%/g, '%%');
}

function escapePosixEnvValue(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}
