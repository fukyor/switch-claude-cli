import fs from 'fs';
import os from 'os';
import path from 'path';

export const CODEX_PROVIDER_ID = 'x';

export interface CodexConfigValues {
  name: string;
  baseUrl: string;
  key: string;
}

export interface CodexConfigWriteResult {
  configPath: string;
  providerId: string;
  createdSection: boolean;
}

const NAME_KEY = 'name';
const BASE_URL_KEY = 'base_url';
const BEARER_TOKEN_KEY = 'experimental_bearer_token';

/**
 * 获取用户级 Codex 配置文件路径
 */
export function getCodexConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

/**
 * 将指定 provider 的 name/base_url/experimental_bearer_token 写入 Codex 配置文本
 */
export function updateCodexConfigToml(
  tomlText: string,
  providerId: string,
  values: CodexConfigValues
): string {
  const newline = tomlText.includes('\r\n') ? '\r\n' : '\n';
  const lines = tomlText === '' ? [] : tomlText.split(/\r?\n/);
  const sectionHeader = `[model_providers.${providerId}]`;
  const sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);

  const nameLine = `${NAME_KEY} = ${toTomlString(values.name)}`;
  const baseUrlLine = `${BASE_URL_KEY} = ${toTomlString(values.baseUrl)}`;
  const bearerTokenLine = `${BEARER_TOKEN_KEY} = ${toTomlString(values.key)}`;

  if (sectionStart === -1) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(sectionHeader, nameLine, baseUrlLine, bearerTokenLine);
    return nextLines.join(newline);
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (isTomlSectionHeader(lines[i]!)) {
      sectionEnd = i;
      break;
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);
  const nameIndex = findKeyLineIndex(sectionLines, NAME_KEY);
  const baseUrlIndex = findKeyLineIndex(sectionLines, BASE_URL_KEY);
  const bearerTokenIndex = findKeyLineIndex(sectionLines, BEARER_TOKEN_KEY);

  if (nameIndex !== -1) {
    sectionLines[nameIndex] = nameLine;
  }
  if (baseUrlIndex !== -1) {
    sectionLines[baseUrlIndex] = baseUrlLine;
  }
  if (bearerTokenIndex !== -1) {
    sectionLines[bearerTokenIndex] = bearerTokenLine;
  }

  if (nameIndex === -1 && baseUrlIndex === -1 && bearerTokenIndex === -1) {
    sectionLines.splice(0, 0, nameLine, baseUrlLine, bearerTokenLine);
  } else if (nameIndex === -1) {
    const nextBaseUrlIndex = findKeyLineIndex(sectionLines, BASE_URL_KEY);
    sectionLines.splice(nextBaseUrlIndex === -1 ? 0 : nextBaseUrlIndex, 0, nameLine);
  }

  if (findKeyLineIndex(sectionLines, BASE_URL_KEY) === -1) {
    const nextNameIndex = findKeyLineIndex(sectionLines, NAME_KEY);
    sectionLines.splice(nextNameIndex + 1, 0, baseUrlLine);
  }

  if (findKeyLineIndex(sectionLines, BEARER_TOKEN_KEY) === -1) {
    const nextBaseUrlIndex = findKeyLineIndex(sectionLines, BASE_URL_KEY);
    sectionLines.splice(nextBaseUrlIndex + 1, 0, bearerTokenLine);
  }

  return [...lines.slice(0, sectionStart + 1), ...sectionLines, ...lines.slice(sectionEnd)].join(
    newline
  );
}

/**
 * 读取并写回用户级 Codex 配置文件
 */
export function writeCodexProviderConfig(
  values: CodexConfigValues,
  providerId: string = CODEX_PROVIDER_ID,
  configPath: string = getCodexConfigPath()
): CodexConfigWriteResult {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const currentToml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
  const createdSection = !hasProviderSection(currentToml, providerId);
  const nextToml = updateCodexConfigToml(currentToml, providerId, values);

  fs.writeFileSync(configPath, nextToml, 'utf-8');

  return {
    configPath,
    providerId,
    createdSection,
  };
}

function hasProviderSection(tomlText: string, providerId: string): boolean {
  const sectionHeader = `[model_providers.${providerId}]`;
  return tomlText.split(/\r?\n/).some((line) => line.trim() === sectionHeader);
}

function findKeyLineIndex(lines: string[], key: string): number {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  return lines.findIndex((line) => pattern.test(line));
}

function isTomlSectionHeader(line: string): boolean {
  return /^\s*\[.*\]\s*$/.test(line);
}

function toTomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');

  return `"${escaped}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
