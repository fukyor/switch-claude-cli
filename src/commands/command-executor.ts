import { ConfigManager } from '../core/config-manager.js';
import { ApiTester } from '../core/api-tester.js';
import { CacheManager } from '../core/cache-manager.js';
import { CliInterface } from '../ui/cli-interface.js';
import { OutputFormatter } from '../ui/output-formatter.js';
import { ProgressIndicator } from '../ui/progress-indicator.js';
import type { Provider, CliOptions, CommandResult, TestResult } from '../types/index.js';
import { PlatformUtils, isWindowsNativeCommandPath } from '../utils/platform-utils.js';
import { FileUtils } from '../utils/file-utils.js';
import { ValidationUtils } from '../utils/validation.js';
import { normalizeProxyUrl } from '../utils/proxy-utils.js';
import {
  buildCustomEnvEntries,
  buildClaudeEnvEntries,
  buildPosixEnvCommand,
  buildProxyEnvEntries,
  buildWindowsEnvCommand,
  type EnvEntry,
} from '../utils/launch-env-utils.js';
import { CODEX_PROVIDER_ID, writeCodexProviderConfig } from '../utils/codex-config-utils.js';
import { StatsManager } from '../core/stats-manager.js';
import { ProviderUtils } from '../utils/provider-utils.js';
import updateNotifier from 'update-notifier';
import { spawn } from 'child_process';
import path from 'node:path';

interface LaunchConfig {
  command: string;
  args: string[];
  viaLoginShell: boolean;
}

interface AppLaunchOptions {
  appName: string;
  commandName: 'claude' | 'codex';
  launchEnvEntries: EnvEntry[];
  printManualFallback: (showShellTip: boolean) => void;
}

function shouldRetryWithShell(error: { code?: string; message?: string }): boolean {
  const code = (error.code || '').toUpperCase();
  if (code === 'ENOENT' || code === 'EACCES' || code === 'UNKNOWN' || code === 'EINVAL') {
    return true;
  }

  const message = (error.message || '').toLowerCase();
  return (
    message.includes('not a valid win32 application') ||
    message.includes('unknown system error') ||
    message.includes('command not found')
  );
}
/**
 * 命令执行器
 * 负责处理所有CLI命令
 */
export class CommandExecutor {
  private readonly configManager: ConfigManager;
  private readonly apiTester: ApiTester;
  private readonly cacheManager: CacheManager;

  constructor() {
    this.configManager = new ConfigManager();
    this.apiTester = new ApiTester();
    this.cacheManager = new CacheManager();
  }

  /**
   * 执行主命令
   */
  async executeMain(options: CliOptions, providerIndex?: string): Promise<CommandResult> {
    try {
      // 检查更新
      await this.checkForUpdates();

      // 优先处理不需要配置文件的命令
      if (options.stats) {
        return this.executeStatsCommand(options.verbose);
      }

      if (options.exportStats) {
        return this.executeExportStatsCommand(options.exportPath);
      }

      if (options.resetStats) {
        return this.executeResetStatsCommand();
      }

      // 确保配置目录存在
      const isFirstRun = FileUtils.ensureConfigDir();

      if (isFirstRun || !FileUtils.fileExists(FileUtils.configPath)) {
        const firstRunResult = await this.handleFirstRun();
        // 只有在用户选择继续时才继续执行主逻辑
        if (firstRunResult.success && firstRunResult.message === 'continue') {
          // 检查配置文件是否已创建且有效
          if (!FileUtils.fileExists(FileUtils.configPath)) {
            return this.createErrorResult('配置文件创建失败');
          }
          // 配置已创建，继续执行主逻辑
        } else {
          return firstRunResult; // 其他情况直接退出
        }
      }

      // 加载配置
      const loadResult = await this.handleAsyncOperation(
        () => this.configManager.loadProviders(),
        '加载配置失败'
      );

      if (!loadResult.success || !loadResult.result) {
        return this.createErrorResult(loadResult.error || '无法加载配置');
      }

      const providers = loadResult.result;

      // 根据 --codex 参数过滤 Provider
      const filteredProviders = options.codex
        ? providers.filter((p) => p.isCodex === true)
        : providers.filter((p) => !p.isCodex);

      if (filteredProviders.length === 0) {
        const mode = options.codex ? 'Codex' : 'Claude';
        return this.createErrorResult(
          `没有配置任何 ${mode} Provider。请使用 ${options.codex ? '--codex ' : ''}--add 添加。`
        );
      }

      // 处理不需要显示provider列表的命令
      if (options.export) {
        return this.executeExportCommand(providers, options.exportPath);
      }

      if (options.import && options.importPath) {
        return this.executeImportCommand(options.importPath, options.merge);
      }

      if (options.backup) {
        return this.executeBackupCommand(providers);
      }

      if (options.listBackups) {
        return this.executeListBackupsCommand();
      }

      // 选择性显示 provider 列表：
      // - --list: 必须显示
      // - --add: 作为参考显示（与原版一致）
      // - --remove/--set-default: 仅当未提供索引时显示，便于用户查看编号
      // - 主流程（无子命令时）依旧显示列表，再进入检测/选择流程
      const shouldShowList =
        options.list ||
        options.add ||
        ((options.remove || options.setDefault) && !options.providerIndex) ||
        (!options.list &&
          !options.add &&
          !options.remove &&
          !options.setDefault &&
          !options.clearDefault);

      if (shouldShowList) {
        const mode = options.codex ? 'Codex' : 'Claude';
        console.log(`📋 配置的 ${mode} Provider 列表：\n`);
        filteredProviders.forEach((p, i) => {
          console.log(`[${i + 1}] ${p.name} (${p.baseUrl})${p.default ? ' ⭐默认' : ''}`);
        });
      }

      // 处理需要显示provider列表的命令
      if (options.list) {
        return this.createSuccessResult();
      }

      if (options.add) {
        return this.executeAddCommand(providers, options.codex || false);
      }

      if (options.edit && options.providerIndex) {
        return this.executeEditCommand(filteredProviders, options.providerIndex);
      }

      if (options.remove && options.providerIndex) {
        return this.executeRemoveCommand(providers, options.providerIndex, filteredProviders);
      }

      if (options.setDefault && options.providerIndex) {
        return this.executeSetDefaultCommand(filteredProviders, options.providerIndex);
      }

      if (options.clearDefault) {
        return this.executeClearDefaultCommand(filteredProviders);
      }

      // 主要功能：批量检测并选择Provider
      return await this.executeMainFlow(filteredProviders, providerIndex, options);
    } catch (error) {
      return this.createErrorResult(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 处理首次运行
   */
  private async handleFirstRun(): Promise<CommandResult> {
    // 显示完整的欢迎信息和帮助
    const pkg = await this.getPackageInfo();
    CliInterface.showWelcomeAndHelp(pkg?.version || '1.0.0');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔧 首次运行，正在初始化配置...`);

    // 询问用户是否使用交互式配置
    try {
      const useInteractive = await CliInterface.askUseInteractiveSetup();

      if (useInteractive) {
        const setupResult = await CliInterface.interactiveSetup();
        if (!setupResult) {
          // 用户取消了配置，回退到手动方式
          const createResult = await this.handleAsyncOperation(
            () => this.configManager.createExampleConfig(),
            '创建示例配置失败'
          );

          if (!createResult.success) {
            return this.createErrorResult(createResult.error || '初始化失败');
          }

          CliInterface.showManualConfigInstructions(FileUtils.configPath);
          return { success: true, message: '', exitCode: 0 };
        }

        // 保存交互式配置的结果
        const saveResult = await this.handleAsyncOperation(
          () => this.configManager.saveProviders([setupResult.provider]),
          '保存配置失败'
        );

        if (!saveResult.success) {
          return this.createErrorResult(saveResult.error || '保存配置失败');
        }

        console.log(`\n✅ 配置已保存到: ${FileUtils.configPath}`);

        if (setupResult.continueSetup) {
          console.log(`\n🎉 配置完成！现在开始检测 API 可用性...\n`);
          // 返回特殊的成功状态，让程序继续执行主逻辑
          return { success: true, message: 'continue', exitCode: 0 };
        } else {
          console.log(`\n💡 配置已完成，你可以随时运行 switch-claude 开始使用！`);
          return { success: true, message: '', exitCode: 0 };
        }
      } else {
        // 用户选择手动配置
        const createResult = await this.handleAsyncOperation(
          () => this.configManager.createExampleConfig(),
          '创建示例配置失败'
        );

        if (!createResult.success) {
          return this.createErrorResult(createResult.error || '初始化失败');
        }

        CliInterface.showManualConfigInstructions(FileUtils.configPath);
        return { success: true, message: '', exitCode: 0 };
      }
    } catch {
      // 如果交互式询问失败，回退到原来的方式
      const createResult = await this.handleAsyncOperation(
        () => this.configManager.createExampleConfig(),
        '创建示例配置失败'
      );

      if (!createResult.success) {
        return this.createErrorResult(createResult.error || '初始化失败');
      }

      CliInterface.showManualConfigInstructions(FileUtils.configPath);
      return { success: true, message: '', exitCode: 0 };
    }
  }

  /**
   * 执行主流程 - 完全按照原版逻辑
   */
  private async executeMainFlow(
    providers: Provider[],
    providerIndex?: string,
    options: CliOptions = {}
  ): Promise<CommandResult> {
    // 注意：Provider列表已经在调用此方法之前显示了

    // 如果指定了 providerIndex，或没有开启 --check 参数，且不刷新，则直接使用不检测
    if ((providerIndex !== undefined || !options.check) && !options.refresh) {
      return this.executeDirectSelection(providers, providerIndex, options);
    }

    // 1. 检查缓存
    const cache = options.refresh ? {} : this.cacheManager.getCache();
    const cacheKeys = Object.keys(cache);
    const hasCachedResults = cacheKeys.length > 0;

    let testResults: TestResult[] = [];

    // 检查是否所有provider都有缓存
    const allProvidersHaveCache = providers.every((p) => {
      const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
      return cache[cacheKey];
    });

    if (allProvidersHaveCache && hasCachedResults && !options.refresh) {
      console.log('\n💾 使用缓存结果 (5分钟内有效，使用 --refresh 强制刷新)：\n');

      // 所有provider都有缓存，直接使用
      testResults = providers.map((p) => {
        const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
        return cache[cacheKey];
      });
    } else {
      // 2. 混合使用缓存和实时检测
      if (hasCachedResults && !options.refresh) {
        console.log('\n💾 部分使用缓存结果 (5分钟内有效，使用 --refresh 强制刷新)：\n');
      } else {
        console.log('\n🔍 正在检测 API 可用性...\n');
      }

      if (!options.verbose) {
        // 非详细模式下显示进度条
        const progress = new ProgressIndicator({
          total: providers.length,
          message: '正在检测 API 可用性',
        });
        progress.start();

        const testPromises = providers.map(async (p, _i) => {
          const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
          if (cache[cacheKey] && !options.refresh) {
            if (progress) {
              progress.update(`${p.name}📋`);
            }
            return cache[cacheKey];
          }

          const result = await this.apiTester.testProvider(p, false);

          // 更新进度
          if (progress) {
            const status = result.available ? '✓' : '✗';
            progress.update(`${p.name}${status}`);
          }

          return result;
        });

        testResults = await Promise.all(testPromises);
        progress.finish();
      } else {
        // 详细模式下显示传统信息
        const testPromises = providers.map(async (p, i) => {
          const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
          if (cache[cacheKey] && !options.refresh) {
            console.log(`🔍 [${i + 1}] ${p.name}: 使用缓存结果`);
            return cache[cacheKey];
          }

          console.log(`🔍 [${i + 1}] ${p.name}: 开始检测...`);
          const result = await this.apiTester.testProvider(p, true);
          console.log(
            `🔍 [${i + 1}] ${p.name}: 检测完成 - ${result.available ? '可用' : '不可用'}`
          );

          return result;
        });

        testResults = await Promise.all(testPromises);
      }
    }

    // 3. 更新缓存
    const newCache: Record<string, TestResult> = {};
    providers.forEach((p, i) => {
      const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
      const result = testResults[i];
      if (result) {
        newCache[cacheKey] = result;
      }
    });
    this.cacheManager.saveCache(newCache);

    // 4. 显示检测结果
    const results = providers.map((p, i) => {
      const testResult = testResults[i];
      if (!testResult) {
        // 如果测试结果不存在，创建一个默认的失败结果
        console.log(`❌ [${i + 1}] ${p.name} 不可用 - 测试结果缺失`);
        StatsManager.recordProviderUse(p.baseUrl, false);
        return {
          ...p,
          ok: false,
          testResult: {
            available: false,
            status: null,
            endpoint: '/v1/messages',
            responseTime: null,
            supportedModels: [],
            error: '测试结果缺失',
          },
        };
      }

      const isAvailable = testResult.available;
      const cacheKey = `${p.baseUrl}:${p.key.slice(-8)}`;
      const fromCache = cache[cacheKey] && !options.refresh;

      let statusText = '';
      if (isAvailable) {
        statusText = `✅ [${i + 1}] ${p.name} 可用`;

        // 添加支持的模型类型显示
        if (testResult.supportedModels && testResult.supportedModels.length > 0) {
          statusText += ` (支持: ${testResult.supportedModels.join(', ')})`;
        }

        if (options.verbose && testResult.responseTime) {
          statusText += ` - (${testResult.status}) ${testResult.responseTime}ms`;
        }
        if (fromCache) statusText += ' 📋';
      } else {
        statusText = `❌ [${i + 1}] ${p.name} 不可用 - ${testResult.error}`;
        if (fromCache) statusText += ' 📋';
      }

      console.log(statusText);
      StatsManager.recordProviderUse(p.baseUrl, isAvailable, testResult.responseTime ?? null);
      return { ...p, ok: isAvailable, testResult };
    });

    // 5. 检查是否有可用的Provider
    const available = results.filter((p) => p.ok);
    if (available.length === 0) {
      return this.createErrorResult('🚨 没有可用的服务！');
    }

    // 6. 选择Provider
    let selected;

    if (providerIndex !== undefined) {
      const index = parseInt(providerIndex, 10) - 1; // 转换为 0-based index
      if (!isNaN(index) && index >= 0 && results[index] && results[index]!.ok) {
        selected = results[index]!;
        console.log(`\n👉 已通过编号选择: ${selected.name} (${selected.baseUrl})`);
      } else {
        return this.createErrorResult(`编号 ${providerIndex} 无效或该 provider 不可用`);
      }
    } else {
      const defaultProvider = results.find((p) => p.default && p.ok);
      if (defaultProvider) {
        selected = defaultProvider;
        console.log(`\n⭐ 已自动选择默认 provider: ${selected.name} (${selected.baseUrl})`);
      } else {
        // 没有默认 provider，总是显示交互式选择
        const _choices = available.map((p) => {
          // 通过 name 和 baseUrl 找到原始索引
          const originalIndex = providers.findIndex(
            (provider) => provider.name === p.name && provider.baseUrl === p.baseUrl
          );
          const displayIndex = originalIndex + 1;
          return {
            name: `[${displayIndex}] ${p.name} (${p.baseUrl})`,
            value: p,
          };
        });

        // 构造选择菜单
        const answer = await CliInterface.selectProvider(available);
        if (answer === null) {
          return this.createErrorResult('未选择 Provider', 0);
        }
        selected = available[answer]!;
      }
    }

    // 7. 启动应用
    return this.launchApp(selected, options.envOnly, options.codex || false);
  }

  /**
   * 直接选择 Provider（跳过检测）
   */
  private async executeDirectSelection(
    providers: Provider[],
    providerIndex?: string,
    options: CliOptions = {}
  ): Promise<CommandResult> {
    let selected: Provider;

    if (providerIndex !== undefined) {
      // 用户指定了编号，直接使用
      const index = parseInt(providerIndex, 10) - 1;
      if (isNaN(index) || index < 0 || index >= providers.length) {
        return this.createErrorResult(
          `编号 ${providerIndex} 无效，有效范围: 1-${providers.length}`
        );
      }
      selected = providers[index]!;
      console.log(`\n👉 直接选择: ${selected.name} (${selected.baseUrl}) - 跳过检测`);
    } else {
      // 没有指定编号，但设置了 --no-check
      // 检查是否有默认 provider
      const defaultProvider = providers.find((p) => p.default);
      if (defaultProvider) {
        selected = defaultProvider;
        console.log(`\n⭐ 使用默认 provider: ${selected.name} (${selected.baseUrl}) - 跳过检测`);
      } else {
        // 没有默认 provider，显示交互式选择
        const answer = await CliInterface.selectProvider(providers);
        if (answer === null) {
          return this.createErrorResult('未选择 Provider', 0);
        }
        selected = providers[answer]!;
        console.log(`\n👉 已选择: ${selected.name} (${selected.baseUrl}) - 跳过检测`);
      }
    }

    // 启动应用
    return this.launchApp(selected, options.envOnly, options.codex || false);
  }

  /**
   * 启动应用（Claude Code 或 Codex）
   */
  private async launchApp(
    provider: Provider & { testResult?: TestResult },
    envOnly: boolean = false,
    isCodex: boolean = false
  ): Promise<CommandResult> {
    if (isCodex) {
      return this.launchCodexApp(provider, envOnly);
    }

    return this.launchClaudeApp(provider, envOnly);
  }

  /**
   * 启动 Claude Code
   */
  private async launchClaudeApp(
    provider: Provider & { testResult?: TestResult },
    envOnly: boolean = false
  ): Promise<CommandResult> {
    const customFields = ProviderUtils.extractCustomFields(provider);
    const proxyEnvEntries = buildProxyEnvEntries(provider.proxy);
    const modeEnvEntries = buildClaudeEnvEntries(provider);
    const customEnvEntries = buildCustomEnvEntries(customFields);
    const launchEnvEntries = [...proxyEnvEntries, ...modeEnvEntries, ...customEnvEntries];

    // 设置代理环境变量（如果配置了）
    for (const { key, value } of proxyEnvEntries) {
      process.env[key] = value;
    }

    // 清除可能存在的 OpenAI 环境变量，避免 Claude 启动时误用
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;

    for (const { key, value } of modeEnvEntries) {
      process.env[key] = value;
    }

    // 提取并应用自定义字段为环境变量
    const customFieldsCount = ProviderUtils.applyCustomFieldsToEnv(customFields);

    const appName = 'Claude Code';
    console.log(`\n✅ 已切换到: ${provider.name} (${provider.baseUrl})`);
    console.log(`\n🔧 环境变量已设置:`);

    console.log(`   ANTHROPIC_BASE_URL=${provider.baseUrl}`);
    console.log(`   ANTHROPIC_AUTH_TOKEN=${provider.key.slice(0, 12)}...`);

    if (provider.defaultHaikuModel) {
      console.log(`   ANTHROPIC_DEFAULT_HAIKU_MODEL=${provider.defaultHaikuModel}`);
    }
    if (provider.defaultSonnetModel) {
      console.log(`   ANTHROPIC_DEFAULT_SONNET_MODEL=${provider.defaultSonnetModel}`);
    }
    if (provider.defaultOpusModel) {
      console.log(`   ANTHROPIC_DEFAULT_OPUS_MODEL=${provider.defaultOpusModel}`);
    }

    if (provider.proxy) {
      // 显示标准化后的代理地址
      const normalizedProxy = normalizeProxyUrl(provider.proxy);
      console.log(`   HTTP_PROXY=${normalizedProxy}`);
      console.log(`   HTTPS_PROXY=${normalizedProxy}`);
    }

    // 显示自定义字段
    if (customFieldsCount > 0) {
      console.log(`\n   自定义字段:`);
      for (const [key, value] of Object.entries(customFields)) {
        console.log(`   ${key}=${value}`);
      }
    }

    const responseTime = provider.testResult?.responseTime ?? null;
    StatsManager.recordProviderUse(provider.name, true, responseTime);

    const commandName = 'claude';

    if (envOnly) {
      console.log(`\n📋 环境变量设置完成！你可以手动运行 ${commandName} 命令`);
      console.log(`\n💡 在当前会话中，你也可以使用这些命令：`);
      if (provider.proxy) {
        const normalizedProxy = normalizeProxyUrl(provider.proxy);
        console.log(`   $env:HTTP_PROXY="${normalizedProxy}"`);
        console.log(`   $env:HTTPS_PROXY="${normalizedProxy}"`);
      }

      console.log(`   $env:ANTHROPIC_BASE_URL="${provider.baseUrl}"`);
      console.log(`   $env:ANTHROPIC_AUTH_TOKEN="${provider.key}"`);
      if (provider.defaultHaikuModel) {
        console.log(`   $env:ANTHROPIC_DEFAULT_HAIKU_MODEL="${provider.defaultHaikuModel}"`);
      }
      if (provider.defaultSonnetModel) {
        console.log(`   $env:ANTHROPIC_DEFAULT_SONNET_MODEL="${provider.defaultSonnetModel}"`);
      }
      if (provider.defaultOpusModel) {
        console.log(`   $env:ANTHROPIC_DEFAULT_OPUS_MODEL="${provider.defaultOpusModel}"`);
      }

      // 显示自定义字段的 PowerShell 命令
      if (customFieldsCount > 0) {
        for (const [key, value] of Object.entries(customFields)) {
          console.log(`   $env:${key}="${value}"`);
        }
      }
      console.log(`   ${commandName}`);
      return { success: true, message: '', exitCode: 0 };
    }

    // 尝试启动应用
    console.log(`\n🚀 正在启动 ${appName}...`);

    return this.launchCommand({
      appName,
      commandName,
      launchEnvEntries,
      printManualFallback: (showShellTip: boolean) => {
        console.log(`\n💡 解决方案：`);
        console.log(`   1. 确保 ${appName} 已正确安装`);
        console.log(`   2. 检查 ${commandName} 命令是否在 PATH 环境变量中`);
        console.log(`   3. 或者手动设置环境变量后运行 ${commandName}：`);

        if (provider.proxy) {
          const normalizedProxy = normalizeProxyUrl(provider.proxy);
          console.log(`      $env:HTTP_PROXY="${normalizedProxy}"`);
          console.log(`      $env:HTTPS_PROXY="${normalizedProxy}"`);
        }

        console.log(`      $env:ANTHROPIC_BASE_URL="${provider.baseUrl}"`);
        console.log(`      $env:ANTHROPIC_AUTH_TOKEN="${provider.key}"`);
        if (provider.defaultHaikuModel) {
          console.log(`      $env:ANTHROPIC_DEFAULT_HAIKU_MODEL="${provider.defaultHaikuModel}"`);
        }
        if (provider.defaultSonnetModel) {
          console.log(`      $env:ANTHROPIC_DEFAULT_SONNET_MODEL="${provider.defaultSonnetModel}"`);
        }
        if (provider.defaultOpusModel) {
          console.log(`      $env:ANTHROPIC_DEFAULT_OPUS_MODEL="${provider.defaultOpusModel}"`);
        }

        if (customFieldsCount > 0) {
          for (const [key, value] of Object.entries(customFields)) {
            console.log(`      $env:${key}="${value}"`);
          }
        }
        console.log(`      ${commandName}`);
        this.printPathHint();
        if (showShellTip) {
          console.log(`\n🔁 备用方案：你也可以运行 "switch-claude -e <编号>"`);
          console.log(`   然后在你的终端手动输入 "${commandName}" 启动。`);
        }
      },
    });
  }

  /**
   * 启动 Codex
   */
  private async launchCodexApp(
    provider: Provider & { testResult?: TestResult },
    envOnly: boolean = false
  ): Promise<CommandResult> {
    if (envOnly) {
      return this.createErrorResult(
        'Codex 模式不支持 --env-only；当前会直接写入 ~/.codex/config.toml。'
      );
    }

    const proxyEnvEntries = buildProxyEnvEntries(provider.proxy);

    const writeResult = writeCodexProviderConfig({
      name: provider.name,
      baseUrl: provider.baseUrl,
      key: provider.key,
    });

    const responseTime = provider.testResult?.responseTime ?? null;
    StatsManager.recordProviderUse(provider.name, true, responseTime);

    console.log(`\n✅ 已切换到: ${provider.name} (${provider.baseUrl})`);
    console.log(`\n📝 Codex 配置已写入:`);
    console.log(`   文件=${writeResult.configPath}`);
    console.log(`   Section=[model_providers.${writeResult.providerId}]`);
    console.log(`   name=${provider.name}`);
    console.log(`   base_url=${provider.baseUrl}`);
    console.log(`   experimental_bearer_token=${provider.key.slice(0, 12)}...`);
    if (provider.proxy) {
      const normalizedProxy = normalizeProxyUrl(provider.proxy);
      console.log(`   HTTP_PROXY=${normalizedProxy}`);
      console.log(`   HTTPS_PROXY=${normalizedProxy}`);
      console.log(`   ALL_PROXY=${normalizedProxy}`);
    }
    if (writeResult.createdSection) {
      console.log(`   已自动创建 [model_providers.${writeResult.providerId}]`);
    }

    console.log(`\n🚀 正在启动 Codex...`);

    return this.launchCommand({
      appName: 'Codex',
      commandName: 'codex',
      launchEnvEntries: proxyEnvEntries,
      printManualFallback: (showShellTip: boolean) => {
        console.log(`\n💡 解决方案：`);
        console.log(`   1. 确保 Codex 已正确安装`);
        console.log(`   2. 检查 codex 命令是否在 PATH 环境变量中`);
        console.log(`   3. 确认 Codex 配置文件中的目标字段已更新：`);
        console.log(`      文件: ${writeResult.configPath}`);
        console.log(`      Section: [model_providers.${CODEX_PROVIDER_ID}]`);
        console.log(`      name = "${provider.name}"`);
        console.log(`      base_url = "${provider.baseUrl}"`);
        console.log(`      experimental_bearer_token = "${provider.key}"`);
        if (provider.proxy) {
          const normalizedProxy = normalizeProxyUrl(provider.proxy);
          console.log(`   4. 代理环境变量也会随 Codex 进程传递：`);
          console.log(`      HTTP_PROXY = "${normalizedProxy}"`);
          console.log(`      HTTPS_PROXY = "${normalizedProxy}"`);
          console.log(`      ALL_PROXY = "${normalizedProxy}"`);
          console.log(`      以及对应的小写变量`);
        } else {
          console.log(`   4. 当前 Provider 未配置代理，Codex 将直连。`);
        }
        console.log(`   5. Codex 模式不再依赖 OPENAI_BASE_URL / OPENAI_API_KEY 环境变量`);
        this.printPathHint();
        if (showShellTip) {
          console.log(`\n🔁 备用方案：先单独运行 "codex" 检查命令是否可用。`);
        }
      },
    });
  }

  /**
   * 启动外部命令
   */
  private async launchCommand({
    appName,
    commandName,
    launchEnvEntries,
    printManualFallback,
  }: AppLaunchOptions): Promise<CommandResult> {
    // 优先查找绝对路径，其次回退到用户登录 shell 执行
    const foundPath =
      commandName === 'codex'
        ? await PlatformUtils.findCodexCommand()
        : await PlatformUtils.findClaudeCommand();
    const platform = PlatformUtils.getPlatform();
    const userShell = PlatformUtils.getUserShell();
    const isAbs = foundPath ? path.isAbsolute(foundPath) : false;
    const appPath = isAbs ? foundPath : null;

    try {
      const buildDirectLaunchConfig = (resolvedPath: string): LaunchConfig | null => {
        if (platform === 'windows') {
          if (!isWindowsNativeCommandPath(resolvedPath)) {
            return null;
          }

          const ext = path.extname(resolvedPath).toLowerCase();
          if (ext === '.cmd' || ext === '.bat') {
            return {
              command: 'cmd.exe',
              args: ['/c', resolvedPath],
              viaLoginShell: false,
            };
          }
          if (ext === '.ps1') {
            return {
              command: 'powershell.exe',
              args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolvedPath],
              viaLoginShell: false,
            };
          }
        }

        return {
          command: resolvedPath,
          args: [],
          viaLoginShell: false,
        };
      };

      const buildShellLaunchConfig = (): LaunchConfig => {
        if (platform === 'windows') {
          // 在 Windows 上使用 cmd 执行（尽量避免对 PowerShell 的依赖）
          const winCmd = buildWindowsEnvCommand(launchEnvEntries, commandName);
          return {
            command: userShell,
            args: ['/c', winCmd],
            viaLoginShell: true,
          };
        }

        // -l 登录 shell（读取 zprofile/profile），-i 交互式（读取 zshrc/bashrc），-c 执行命令
        const exportCmd = buildPosixEnvCommand(launchEnvEntries, commandName);
        return {
          command: userShell,
          args: ['-l', '-i', '-c', exportCmd],
          viaLoginShell: true,
        };
      };

      const directLaunchConfig = appPath ? buildDirectLaunchConfig(appPath) : null;
      const shellLaunchConfig = buildShellLaunchConfig();
      const initialLaunchConfig = directLaunchConfig ?? shellLaunchConfig;

      if (appPath) {
        if (directLaunchConfig) {
          console.log(`🔍 使用 ${commandName} 命令路径: ${appPath}`);
        } else {
          console.log(
            `🔍 使用 ${commandName} 命令路径: ${appPath} (非 Windows 原生命令，改为通过登录 shell 执行)`
          );
        }
      } else {
        console.log(`🔍 使用 ${commandName} 命令路径: 未解析到二进制，尝试通过登录 shell 执行`);
      }

      const childEnv = { ...process.env };
      delete childEnv.NODE_OPTIONS;
      delete (childEnv as Record<string, unknown>).VSCODE_INSPECTOR_OPTIONS;
      for (const { key, value } of launchEnvEntries) {
        childEnv[key] = value;
      }

      return new Promise(() => {
        const startLaunch = (config: LaunchConfig, allowShellRetry: boolean) => {
          if (config.viaLoginShell) {
            console.log(`🔁 通过登录 shell 启动: ${config.command} ${config.args.join(' ')}`);
          }

          const handleLaunchError = (error: unknown) => {
            const err = error as { code?: string; message?: string };

            if (allowShellRetry && !config.viaLoginShell && shouldRetryWithShell(err)) {
              const msg = err.message || err.code || '未知错误';
              console.log(`\n⚠️  直接启动 ${commandName} 失败，尝试通过登录 shell 回退: ${msg}`);
              startLaunch(shellLaunchConfig, false);
              return;
            }

            if (err && err.code === 'ENOENT') {
              console.error(`\n❌ 找不到 '${commandName}' 命令！`);
              printManualFallback(config.viaLoginShell || !directLaunchConfig);
            } else {
              const msg = err && err.message ? err.message : String(error);
              console.error(`\n❌ 启动 ${commandName} 时出错: ${msg}`);
              printManualFallback(config.viaLoginShell || !directLaunchConfig);
            }
            process.exit(1);
          };

          try {
            const childProcess = spawn(config.command, config.args, {
              stdio: ['inherit', 'inherit', 'inherit'], // 继承 stdin, stdout, stderr
              env: childEnv,
              shell: false,
            });

            childProcess.once('spawn', () => {
              console.log(`✅ ${appName} 已启动`);
            });

            childProcess.once('error', handleLaunchError);

            childProcess.once('exit', (code) => {
              if (code !== 0 && code !== null) {
                console.log(`\n⚠️  ${appName} 退出，退出码: ${code}`);
              }
              process.exit(code || 0);
            });
          } catch (error) {
            handleLaunchError(error);
          }
        };

        startLaunch(initialLaunchConfig, directLaunchConfig !== null);
      });
    } catch (error) {
      return this.createErrorResult(
        `启动 ${commandName} 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private printPathHint(): void {
    console.log(`\n🔍 当前 PATH 包含的目录：`);
    const paths = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
    paths.slice(0, 5).forEach((p) => console.log(`   - ${p}`));
    if (paths.length > 5) {
      console.log(`   ... 还有 ${paths.length - 5} 个目录`);
    }
  }

  /**
   * 执行列表命令
   */
  private executeListCommand(providers: Provider[], verbose: boolean = false): CommandResult {
    const output = OutputFormatter.formatProviderList(providers, verbose);
    console.log(output);
    return this.createSuccessResult();
  }

  /**
   * 执行添加命令
   */
  private async executeAddCommand(
    providers: Provider[],
    isCodex: boolean = false
  ): Promise<CommandResult> {
    const newProvider = await CliInterface.addProvider(providers, isCodex);
    if (!newProvider) {
      return this.createErrorResult('添加操作已取消', 0);
    }

    // 如果设置为默认，清除其他默认设置
    if (newProvider.default) {
      providers.forEach((p) => (p.default = false));
    }

    providers.push(newProvider);

    const saveResult = await this.handleAsyncOperation(
      () => this.configManager.saveProviders(providers),
      '保存配置失败'
    );

    if (!saveResult.success) {
      return this.createErrorResult(saveResult.error || '保存失败');
    }

    return this.createSuccessResult(`Provider "${newProvider.name}" 添加成功`);
  }

  /**
   * 执行编辑命令
   */
  private async executeEditCommand(
    providers: Provider[],
    indexStr: string
  ): Promise<CommandResult> {
    const validation = ValidationUtils.validateProviderIndex(indexStr, providers.length);
    if (!validation.valid) {
      return this.createErrorResult(validation.error || '无效索引');
    }

    const index = validation.value!;
    const provider = providers[index]!;

    const updatedProvider = await CliInterface.editProvider(provider, providers);
    if (!updatedProvider) {
      return this.createErrorResult('编辑操作已取消', 0);
    }

    // 如果设置为默认，清除其他默认设置
    if (updatedProvider.default) {
      providers.forEach((p) => (p.default = false));
    }

    // 替换原 Provider
    providers[index] = updatedProvider;

    const saveResult = await this.handleAsyncOperation(
      () => this.configManager.saveProviders(providers),
      '保存配置失败'
    );

    if (!saveResult.success) {
      return this.createErrorResult(saveResult.error || '保存失败');
    }

    return this.createSuccessResult(`Provider "${updatedProvider.name}" 更新成功`);
  }

  /**
   * 执行删除命令
   */
  private async executeRemoveCommand(
    allProviders: Provider[],
    indexStr: string,
    filteredProviders: Provider[]
  ): Promise<CommandResult> {
    // 不允许删除最后一个 Provider，避免保存时报”配置文件为空”且信息重复
    if (allProviders.length <= 1) {
      return this.createErrorResult(
        '无法删除：至少需要一个 provider（请先添加新的 provider 后再删除）'
      );
    }

    const validation = ValidationUtils.validateProviderIndex(indexStr, filteredProviders.length);
    if (!validation.valid) {
      return this.createErrorResult(validation.error || '无效索引');
    }

    const index = validation.value!;
    const provider = filteredProviders[index]!;

    const confirmed = await CliInterface.confirmRemoveProvider(provider);
    if (!confirmed) {
      return this.createErrorResult('删除操作已取消', 0);
    }

    // 从所有 providers 中删除
    const allIndex = allProviders.findIndex((p) => p.name === provider.name);
    if (allIndex !== -1) {
      allProviders.splice(allIndex, 1);
    }

    const saveResult = await this.handleAsyncOperation(
      () => this.configManager.saveProviders(allProviders),
      '保存配置失败'
    );

    if (!saveResult.success) {
      return this.createErrorResult(saveResult.error || '保存失败');
    }

    return this.createSuccessResult(`Provider “${provider.name}” 删除成功`);
  }

  /**
   * 执行设置默认命令
   */
  private async executeSetDefaultCommand(
    providers: Provider[],
    indexStr: string
  ): Promise<CommandResult> {
    const validation = ValidationUtils.validateProviderIndex(indexStr, providers.length);
    if (!validation.valid) {
      return this.createErrorResult(validation.error || '无效索引');
    }

    const index = validation.value!;
    const provider = providers[index]!;

    // 清除所有默认设置
    providers.forEach((p) => (p.default = false));
    // 设置新的默认
    provider.default = true;

    const saveResult = await this.handleAsyncOperation(
      () => this.configManager.saveProviders(providers),
      '保存配置失败'
    );

    if (!saveResult.success) {
      return this.createErrorResult(saveResult.error || '保存失败');
    }

    return this.createSuccessResult(`Provider "${provider.name}" 已设置为默认`);
  }

  /**
   * 执行清除默认命令
   */
  private async executeClearDefaultCommand(providers: Provider[]): Promise<CommandResult> {
    providers.forEach((p) => (p.default = false));

    const saveResult = await this.handleAsyncOperation(
      () => this.configManager.saveProviders(providers),
      '保存配置失败'
    );

    if (!saveResult.success) {
      return this.createErrorResult(saveResult.error || '保存失败');
    }

    return this.createSuccessResult('已清除默认 Provider 设置');
  }

  /**
   * 执行导出命令
   */
  private async executeExportCommand(
    providers: Provider[],
    filePath?: string
  ): Promise<CommandResult> {
    const exportResult = await this.handleAsyncOperation(
      () => this.configManager.exportConfig(providers, filePath),
      '导出配置失败'
    );

    if (!exportResult.success) {
      return this.createErrorResult(exportResult.error || '导出失败');
    }

    return this.createSuccessResult(`配置已导出到: ${exportResult.result}`);
  }

  /**
   * 执行导入命令
   */
  private async executeImportCommand(
    filePath: string,
    merge: boolean = false
  ): Promise<CommandResult> {
    const importResult = await this.handleAsyncOperation(
      () => this.configManager.importConfig(filePath, { merge }),
      '导入配置失败'
    );

    if (!importResult.success) {
      return this.createErrorResult(importResult.error || '导入失败');
    }

    const mode = merge ? '合并' : '替换';
    return this.createSuccessResult(`配置已${mode}导入，共 ${importResult.result} 个 Provider`);
  }

  /**
   * 执行备份命令
   */
  private async executeBackupCommand(providers: Provider[]): Promise<CommandResult> {
    const backupResult = await this.handleAsyncOperation(
      () => this.configManager.backupConfig(providers),
      '备份配置失败'
    );

    if (!backupResult.success) {
      return this.createErrorResult(backupResult.error || '备份失败');
    }

    return this.createSuccessResult(`配置已备份到: ${backupResult.result}`);
  }

  /**
   * 执行列出备份命令
   */
  private executeListBackupsCommand(): CommandResult {
    const backups = FileUtils.getBackupFiles();
    const output = OutputFormatter.formatBackupList(backups);
    console.log(output);
    return this.createSuccessResult();
  }

  /**
   * 检查更新
   */
  private async checkForUpdates(): Promise<void> {
    try {
      const pkg = await this.getPackageInfo();

      if (!pkg) {
        return;
      }

      const notifier = updateNotifier({
        pkg,
        updateCheckInterval: 0,
        shouldNotifyInNpmScript: false,
      });

      const update = notifier.update;
      if (
        update &&
        update.latest &&
        update.current &&
        this.isVersionNewer(update.latest, update.current)
      ) {
        CliInterface.showUpdateNotification(update.current, update.latest);
        return;
      }

      try {
        const info = await notifier.fetchInfo();

        if (info.latest && info.current && this.isVersionNewer(info.latest, info.current)) {
          CliInterface.showUpdateNotification(info.current, info.latest);
        }
      } catch {
        // 忽略细节错误，避免影响主流程
      }
    } catch {
      // 忽略更新检查错误
    }
  }

  private isVersionNewer(latest: string, current: string): boolean {
    const latestInfo = this.parseSemver(latest);
    const currentInfo = this.parseSemver(current);

    if (!latestInfo || !currentInfo) {
      return latest !== current;
    }

    const maxLength = Math.max(latestInfo.core.length, currentInfo.core.length);
    for (let i = 0; i < maxLength; i++) {
      const latestPart = latestInfo.core[i] ?? 0;
      const currentPart = currentInfo.core[i] ?? 0;
      if (latestPart > currentPart) {
        return true;
      }
      if (latestPart < currentPart) {
        return false;
      }
    }

    const latestPre = latestInfo.prerelease;
    const currentPre = currentInfo.prerelease;

    if (latestPre.length === 0 && currentPre.length === 0) {
      return false;
    }
    if (latestPre.length === 0) {
      return true;
    }
    if (currentPre.length === 0) {
      return false;
    }

    const len = Math.max(latestPre.length, currentPre.length);
    for (let i = 0; i < len; i++) {
      const latestId = latestPre[i];
      const currentId = currentPre[i];

      if (latestId === undefined) {
        return false;
      }
      if (currentId === undefined) {
        return true;
      }

      const latestIsNum = /^[0-9]+$/.test(latestId);
      const currentIsNum = /^[0-9]+$/.test(currentId);

      if (latestIsNum && currentIsNum) {
        const latestNum = Number.parseInt(latestId, 10);
        const currentNum = Number.parseInt(currentId, 10);
        if (latestNum > currentNum) {
          return true;
        }
        if (latestNum < currentNum) {
          return false;
        }
        continue;
      }

      if (latestIsNum !== currentIsNum) {
        return !latestIsNum;
      }

      const comparison = latestId.localeCompare(currentId);
      if (comparison > 0) {
        return true;
      }
      if (comparison < 0) {
        return false;
      }
    }

    return false;
  }

  private parseSemver(version: string): { core: number[]; prerelease: string[] } | null {
    if (!version || typeof version !== 'string') {
      return null;
    }

    const cleaned = version.split('+')[0]?.trim();
    if (!cleaned) {
      return null;
    }

    const [corePart, prereleasePart] = cleaned.split('-');
    const coreSegments = corePart
      .split('.')
      .map((segment) => Number.parseInt(segment, 10))
      .map((value) => (Number.isNaN(value) ? 0 : value));

    const prereleaseSegments = prereleasePart
      ? prereleasePart.split('.').filter((segment) => segment.length > 0)
      : [];

    return {
      core: coreSegments,
      prerelease: prereleaseSegments,
    };
  }

  /**
   * 处理异步操作的错误
   */
  private async handleAsyncOperation<T>(
    operation: () => Promise<T>,
    errorMessage: string = '操作失败'
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `${errorMessage}: ${message}`,
      };
    }
  }

  /**
   * 创建成功结果
   */
  private createSuccessResult(message?: string): CommandResult {
    return {
      success: true,
      message,
      exitCode: 0,
    };
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(error: string, exitCode: number = 1): CommandResult {
    return {
      success: false,
      error,
      exitCode,
    };
  }

  /**
   * 执行统计命令
   */
  private executeStatsCommand(verbose: boolean = false): CommandResult {
    StatsManager.cleanupOldStats();
    StatsManager.displayStats(verbose);
    return this.createSuccessResult();
  }

  /**
   * 执行导出统计命令
   */
  private executeExportStatsCommand(filePath?: string): CommandResult {
    const targetPath =
      filePath && filePath.trim() !== '' ? filePath : StatsManager.generateExportFilename();
    const exportedPath = StatsManager.exportStats(targetPath);

    if (exportedPath) {
      return this.createSuccessResult(`统计数据已导出到: ${exportedPath}`);
    }

    return this.createErrorResult('导出统计数据失败');
  }

  /**
   * 执行重置统计命令
   */
  private executeResetStatsCommand(): CommandResult {
    StatsManager.resetStats();
    return this.createSuccessResult('统计数据已重置');
  }

  /**
   * 获取包信息
   */
  private async getPackageInfo(): Promise<{ version: string; name: string } | null> {
    return FileUtils.getPackageInfo();
  }
}
