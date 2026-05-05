import { describe, expect, it } from 'vitest';

import { CODEX_PROVIDER_ID, updateCodexConfigToml } from '../src/utils/codex-config-utils.js';

describe('codex-config-utils', () => {
  it('会更新现有 [model_providers.x] 中的 name、base_url 和 experimental_bearer_token', () => {
    const toml = [
      'model_provider = "x"',
      '',
      '[model_providers.x]',
      'name = "xcodex"',
      'base_url = "https://old.example.com/v1"',
      'experimental_bearer_token = "old-token"',
      'wire_api = "responses"',
      '',
      '[features]',
      'powershell_utf8 = true',
    ].join('\n');

    const updated = updateCodexConfigToml(toml, CODEX_PROVIDER_ID, {
      name: 'new-provider-name',
      baseUrl: 'https://new.example.com/v1',
      key: 'new-token',
    });

    expect(updated).toContain('name = "new-provider-name"');
    expect(updated).toContain('base_url = "https://new.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "new-token"');
    expect(updated).toContain('wire_api = "responses"');
    expect(updated).toContain('[features]');
  });

  it('会保留原始 CRLF 换行风格', () => {
    const toml = [
      'model_provider = "x"',
      '',
      '[model_providers.x]',
      'name = "xcodex"',
      'base_url = "https://old.example.com/v1"',
      'experimental_bearer_token = "old-token"',
    ].join('\r\n');

    const updated = updateCodexConfigToml(toml, CODEX_PROVIDER_ID, {
      name: 'new-provider-name',
      baseUrl: 'https://new.example.com/v1',
      key: 'new-token',
    });

    expect(updated).toContain('\r\n[model_providers.x]\r\n');
    expect(updated).toContain('name = "new-provider-name"\r\n');
    expect(updated).toContain('base_url = "https://new.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "new-token"');
    expect(updated).not.toContain('\n[model_providers.x]\n');
  });

  it('会在缺少 [model_providers.x] 时自动追加最小 section', () => {
    const toml = ['model_provider = "x"', '', '[features]', 'powershell_utf8 = true'].join('\n');

    const updated = updateCodexConfigToml(toml, CODEX_PROVIDER_ID, {
      name: 'created-provider-name',
      baseUrl: 'https://created.example.com/v1',
      key: 'created-token',
    });

    expect(updated).toContain('[model_providers.x]');
    expect(updated).toContain('name = "created-provider-name"');
    expect(updated).toContain('base_url = "https://created.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "created-token"');
    expect(updated).toContain('[features]');
  });

  it('会在已有 section 但缺少字段时补齐，并保持 name、base_url、experimental_bearer_token 的顺序', () => {
    const toml = ['model_provider = "x"', '', '[model_providers.x]', 'wire_api = "responses"'].join(
      '\n'
    );

    const updated = updateCodexConfigToml(toml, CODEX_PROVIDER_ID, {
      name: 'fill-provider-name',
      baseUrl: 'https://fill.example.com/v1',
      key: 'fill-token',
    });

    expect(updated).toContain(
      [
        '[model_providers.x]',
        'name = "fill-provider-name"',
        'base_url = "https://fill.example.com/v1"',
        'experimental_bearer_token = "fill-token"',
      ].join('\n')
    );
    expect(updated).toContain('wire_api = "responses"');
  });

  it('会正确转义 TOML 字符串中的特殊字符', () => {
    const toml = ['model_provider = "x"', '', '[model_providers.x]'].join('\n');

    const updated = updateCodexConfigToml(toml, CODEX_PROVIDER_ID, {
      name: 'line1\nline2\t"name"',
      baseUrl: 'https://example.com/v1?path=C:\\temp\\"demo"',
      key: 'line1\nline2\t"value"',
    });

    expect(updated).toContain('name = "line1\\nline2\\t\\"name\\""');
    expect(updated).toContain('base_url = "https://example.com/v1?path=C:\\\\temp\\\\\\"demo\\""');
    expect(updated).toContain('experimental_bearer_token = "line1\\nline2\\t\\"value\\""');
  });
});
