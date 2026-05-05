import { describe, expect, it } from 'vitest';

import {
  buildCustomEnvEntries,
  buildClaudeEnvEntries,
  buildPosixEnvCommand,
  buildProxyEnvEntries,
  buildWindowsEnvCommand,
} from '../src/utils/launch-env-utils.js';
import { extractExecutablePath, isWindowsNativeCommandPath } from '../src/utils/platform-utils.js';
import type { Provider } from '../src/types/index.js';

describe('extractExecutablePath', () => {
  it('在 Windows 上会优先选择 .cmd 而不是无扩展名 shim', () => {
    const output = [
      'E:\\ProgramFiles\\nvm\\nodejs\\claude',
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\claude.cmd',
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\claude.ps1',
    ].join('\r\n');

    expect(extractExecutablePath(output, 'windows')).toBe(
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\claude.cmd'
    );
  });

  it('能从 POSIX 的 which 输出中提取绝对路径', () => {
    expect(extractExecutablePath('/usr/local/bin/claude\n', 'linux')).toBe('/usr/local/bin/claude');
  });
});

describe('isWindowsNativeCommandPath', () => {
  it('只把 Windows 原生命令后缀视为可直接启动', () => {
    expect(isWindowsNativeCommandPath('E:\\ProgramFiles\\nvm\\nodejs\\claude')).toBe(false);
    expect(isWindowsNativeCommandPath('E:\\ProgramFiles\\nvm\\nodejs\\claude.cmd')).toBe(true);
    expect(isWindowsNativeCommandPath('E:\\ProgramFiles\\nvm\\nodejs\\claude.exe')).toBe(true);
    expect(isWindowsNativeCommandPath('E:\\ProgramFiles\\nvm\\nodejs\\claude.ps1')).toBe(true);
  });
});

describe('launch-env-utils', () => {
  const provider: Provider = {
    name: 'TestProvider',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    key: 'test-token',
    proxy: '127.0.0.1:7897',
    defaultHaikuModel: 'glm-4.5-air',
    defaultSonnetModel: 'glm-4.7',
    defaultOpusModel: 'glm-4.7',
  };

  it('会为代理生成标准化的环境变量', () => {
    const proxyEntries = buildProxyEnvEntries(provider.proxy);
    const values = Object.fromEntries(proxyEntries.map(({ key, value }) => [key, value]));

    expect(values.HTTP_PROXY).toBe('http://127.0.0.1:7897');
    expect(values.HTTPS_PROXY).toBe('http://127.0.0.1:7897');
    expect(values.ALL_PROXY).toBe('http://127.0.0.1:7897');
    expect(values.http_proxy).toBe('http://127.0.0.1:7897');
    expect(values.https_proxy).toBe('http://127.0.0.1:7897');
  });

  it('会为 Claude 模式生成不含弯引号的 Windows 启动命令，并包含代理变量', () => {
    const envEntries = [
      ...buildProxyEnvEntries(provider.proxy),
      ...buildClaudeEnvEntries(provider),
      ...buildCustomEnvEntries({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }),
    ];

    const command = buildWindowsEnvCommand(envEntries, 'claude');

    expect(command).toContain('set "HTTP_PROXY=http://127.0.0.1:7897"');
    expect(command).toContain('set "HTTPS_PROXY=http://127.0.0.1:7897"');
    expect(command).toContain('set "ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic"');
    expect(command).toContain('set "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1"');
    expect(command).not.toMatch(/[“”]/);
    expect(command.endsWith(' && claude')).toBe(true);
  });

  it('会为 Claude 模式生成不含弯引号的 POSIX 启动命令', () => {
    const envEntries = [
      ...buildProxyEnvEntries(provider.proxy),
      ...buildClaudeEnvEntries(provider),
      ...buildCustomEnvEntries({ TEST_VALUE: "a'b" }),
    ];

    const command = buildPosixEnvCommand(envEntries, 'claude');

    expect(command).toContain("export HTTP_PROXY='http://127.0.0.1:7897'");
    expect(command).toContain("export ANTHROPIC_BASE_URL='https://open.bigmodel.cn/api/anthropic'");
    expect(command).toContain(`export TEST_VALUE='a'"'"'b'`);
    expect(command).not.toMatch(/[“”]/);
    expect(command.endsWith('; claude')).toBe(true);
  });
});
