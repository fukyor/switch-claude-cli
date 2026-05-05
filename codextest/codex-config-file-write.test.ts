import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CODEX_PROVIDER_ID, writeCodexProviderConfig } from '../src/utils/codex-config-utils.js';

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('codextest: codex-config 文件写入', () => {
  it('会把 name/baseUrl/key 分别写入 name/base_url/experimental_bearer_token', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-claude-codex-'));
    createdDirs.push(tempDir);

    const configPath = path.join(tempDir, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        'model_provider = "x"',
        '',
        '[model_providers.x]',
        'name = "legacy-name"',
        'base_url = "https://legacy.example.com/v1"',
        'experimental_bearer_token = "legacy-token"',
        'wire_api = "responses"',
      ].join('\n'),
      'utf-8'
    );

    const result = writeCodexProviderConfig(
      {
        name: '写入后的 Provider 名称',
        baseUrl: 'https://written.example.com/v1',
        key: 'sk-written-token',
      },
      CODEX_PROVIDER_ID,
      configPath
    );

    const updated = fs.readFileSync(configPath, 'utf-8');

    expect(result.configPath).toBe(configPath);
    expect(result.providerId).toBe(CODEX_PROVIDER_ID);
    expect(result.createdSection).toBe(false);
    expect(updated).toContain('name = "写入后的 Provider 名称"');
    expect(updated).toContain('base_url = "https://written.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "sk-written-token"');
    expect(updated).toContain('wire_api = "responses"');
  });
});
