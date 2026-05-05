import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock('child_process');
});

describe('codextest: launchCommand 代理环境透传', () => {
  it('会把 launchEnvEntries 合并到直接 spawn 的子进程环境中', async () => {
    const child = new EventEmitter();
    const spawnMock = vi.fn(() => child as any);

    vi.doMock('child_process', async () => {
      const actual = await vi.importActual<typeof import('child_process')>('child_process');
      return {
        ...actual,
        spawn: spawnMock,
      };
    });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);

    const { CommandExecutor } = await import('../src/commands/command-executor.js');
    const { PlatformUtils } = await import('../src/utils/platform-utils.js');

    vi.spyOn(PlatformUtils, 'findCodexCommand').mockResolvedValue(
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\codex.cmd'
    );
    vi.spyOn(PlatformUtils, 'getPlatform').mockReturnValue('windows');
    vi.spyOn(PlatformUtils, 'getUserShell').mockReturnValue('cmd.exe');

    const executor = Object.create(CommandExecutor.prototype) as any;
    void executor.launchCommand({
      appName: 'Codex',
      commandName: 'codex',
      launchEnvEntries: [
        { key: 'HTTP_PROXY', value: 'http://127.0.0.1:7897' },
        { key: 'HTTPS_PROXY', value: 'http://127.0.0.1:7897' },
        { key: 'ALL_PROXY', value: 'http://127.0.0.1:7897' },
        { key: 'http_proxy', value: 'http://127.0.0.1:7897' },
      ],
      printManualFallback: vi.fn(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string | undefined>; shell: boolean }
    ];

    expect(command).toBe('cmd.exe');
    expect(args).toEqual(['/c', 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\codex.cmd']);
    expect(options.shell).toBe(false);
    expect(options.env.HTTP_PROXY).toBe('http://127.0.0.1:7897');
    expect(options.env.HTTPS_PROXY).toBe('http://127.0.0.1:7897');
    expect(options.env.ALL_PROXY).toBe('http://127.0.0.1:7897');
    expect(options.env.http_proxy).toBe('http://127.0.0.1:7897');

    child.emit('exit', 0);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
