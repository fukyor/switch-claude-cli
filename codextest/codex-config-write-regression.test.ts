import { describe, expect, it } from 'vitest';

import {
  CODEX_PROVIDER_ID as DIST_CODEX_PROVIDER_ID,
  updateCodexConfigToml as updateDistCodexConfigToml,
} from '../dist/utils/codex-config-utils.js';
import {
  CODEX_PROVIDER_ID as SRC_CODEX_PROVIDER_ID,
  updateCodexConfigToml as updateSrcCodexConfigToml,
} from '../src/utils/codex-config-utils.js';

describe('codextest: codex-config 写入回归', () => {
  it.each([
    {
      label: 'src',
      providerId: SRC_CODEX_PROVIDER_ID,
      updateCodexConfigToml: updateSrcCodexConfigToml,
    },
    {
      label: 'dist',
      providerId: DIST_CODEX_PROVIDER_ID,
      updateCodexConfigToml: updateDistCodexConfigToml,
    },
  ])('$label 会把 name/baseUrl/key 分别写入正确的 Codex 字段', ({ providerId, updateCodexConfigToml }) => {
    const toml = [
      'model_provider = "x"',
      '',
      '[model_providers.x]',
      'name = "legacy-name"',
      'base_url = "https://legacy.example.com/v1"',
      'experimental_bearer_token = "legacy-token"',
      'wire_api = "responses"',
    ].join('\n');

    const updated = updateCodexConfigToml(toml, providerId, {
      name: '目标 Provider',
      baseUrl: 'https://target.example.com/v1',
      key: 'sk-test-token',
    });

    expect(updated).toContain('name = "目标 Provider"');
    expect(updated).toContain('base_url = "https://target.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "sk-test-token"');
    expect(updated).toContain('wire_api = "responses"');
  });
});
