import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandExecutor } from '../src/commands/command-executor.js';
import { StatsManager } from '../src/core/stats-manager.js';

const createdDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('codextest: codex 启动写入链路', () => {
  it('会在启动 codex 前把 name/baseUrl/key 直接写入 ~/.codex/config.toml', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-claude-codex-launch-'));
    createdDirs.push(tempDir);

    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
    vi.spyOn(StatsManager, 'recordProviderUse').mockImplementation(() => undefined);

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

    const executor = new CommandExecutor() as any;
    const launchCommandSpy = vi.fn().mockResolvedValue({ success: true, exitCode: 0 });
    executor.launchCommand = launchCommandSpy;

    const result = await executor.launchCodexApp(
      {
        name: 'Codex 测试 Provider',
        baseUrl: 'https://selected.example.com/v1',
        key: 'sk-selected-token',
        proxy: '127.0.0.1:7897',
        isCodex: true,
      },
      false
    );

    const updated = fs.readFileSync(configPath, 'utf-8');

    expect(result).toEqual({ success: true, exitCode: 0 });
    expect(launchCommandSpy).toHaveBeenCalledTimes(1);
    expect(launchCommandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: 'Codex',
        commandName: 'codex',
        launchEnvEntries: expect.arrayContaining([
          { key: 'HTTP_PROXY', value: 'http://127.0.0.1:7897' },
          { key: 'HTTPS_PROXY', value: 'http://127.0.0.1:7897' },
          { key: 'ALL_PROXY', value: 'http://127.0.0.1:7897' },
          { key: 'http_proxy', value: 'http://127.0.0.1:7897' },
          { key: 'https_proxy', value: 'http://127.0.0.1:7897' },
          { key: 'all_proxy', value: 'http://127.0.0.1:7897' },
        ]),
      })
    );
    expect(updated).toContain('name = "Codex 测试 Provider"');
    expect(updated).toContain('base_url = "https://selected.example.com/v1"');
    expect(updated).toContain('experimental_bearer_token = "sk-selected-token"');
    expect(updated).toContain('wire_api = "responses"');
  });
});
