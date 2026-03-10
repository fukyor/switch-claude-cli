# 支持 codex 启动功能方案

通过增加 `--codex` (或 `-x`) 参数启动 Codex，并根据原有架构调整环境变量映射与可执行文件调用逻辑。
同时移除现有的 API 自动检测验证。

## 用户审核

这是一次平滑的能力增强。主要变更在于执行时通过判断 `options.codex`，决定使用 `claude` 的变量和命令还是 `codex` 的变量和命令，这使得工具能够更加通用。

## Proposed Changes

### 1. [src/types/index.ts](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/types/index.ts)

在 [CliOptions](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/types/index.ts#46-72) 中增加 `codex?: boolean;`。

### 2. [src/cli/cli-parser.ts](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/cli/cli-parser.ts)

- 识别 `-x` 及 `--codex` 标志，当传入时设置 `options.codex = true;`。
- 修改相应的使用说明 [getUsage()](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/cli/cli-parser.ts#269-285) 以提示此参数：`switch-claude --codex`。

### 3. [src/utils/platform-utils.ts](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/utils/platform-utils.ts)

- 增加 `findCodexCommand()` 和 `getCommonCodexPaths()` 方法，查找逻辑完全参考目前的 [findClaudeCommand](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/utils/platform-utils.ts#43-121)。其中涉及的文件名包括 `codex.exe`, `codex.cmd` 等。

### 4. 数据结构增强 ([src/types/index.ts](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/types/index.ts))

- 在 [Provider](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/types/index.ts#5-23) 接口中，增加用于标识能否作为 Codex 提供商及相关属性（例如：`isCodex?: boolean`、`defaultCodexModel?: string` 等）。这样我们可以使用同样的 [providers.json](file:///c:/Users/Administrator/.switch-claude/providers.json) 文件来管理所有服务。

### 5. [src/commands/command-executor.ts](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/commands/command-executor.ts)与交互

- **配置持久化与新增隔离**：当通过 `--codex --add` 交互式新增提供商时，自动设置 `isCodex: true` 以便与普通的 Claude 配置区分开并保存至 [providers.json](file:///c:/Users/Administrator/.switch-claude/providers.json) 之中。
- **移除自动检测**：修改 [executeMainFlow](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/commands/command-executor.ts#235-438) 逻辑，去除原来的并发检测逻辑，默认以跳过检测的方式（类似原先的 `--no-check`）进行提供商选择和启动。
- **配置过滤加载**：加载完整 [providers.json](file:///c:/Users/Administrator/.switch-claude/providers.json) 之后，在进入列表打印或提供商选择逻辑前：
  - 如果命令行带着 `--codex`，则仅保留并在终端打印配置中 `isCodex === true` 的提供商。
  - 如果未带参数（原始 Claude 模式），则仅保留并在终端打印没有 `isCodex` 或 `isCodex` 为 false 的正常 Claude 候选提供商列表。
- 修改或重构 [launchClaude](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/commands/command-executor.ts#479-745) 方法为更加多态的方法（例如 `launchApp(provider, envOnly, options)`）。
- 对于环境变量的配置：
  - **Claude** 保持不变。
  - **Codex**：注入代理变量。将 `provider.baseUrl` 映射到 `OPENAI_BASE_URL`；将 `provider.key` 映射到 `OPENAI_API_KEY`。并且原样附加提取出的自定义字段。不注入 `ANTHROPIC_DEFAULT_*_MODEL` 等变量。
- 对于启动进程与降级策略：
  - 判断应调用的目标路径为 `claudePath` 还是 `codexPath`。
  - 在无法直接找到路径时构建的 fallback shell 字符串（涉及 [set](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/commands/command-executor.ts#1188-1195) / [export](file:///e:/ProgramFiles/nvm/v22.16.0/node_modules/switch-claude-cli/src/core/config-manager.ts#97-117) 命令）也分岔对应两套环境处理逻辑，最后执行的指令为 `claude` 或者 `codex`。

## Verification Plan

### 局部功能测试

修改完成后，可以对 CLI 运行如下参数：
`npx tsx src/index.ts -e --codex 1` 或 `npx tsx src/index.ts -x`，然后检查它最后输出的环境变量清单和准备启动的命令，验证是否从 Claude 平滑切换到了 Codex 的变量 (`OPENAI_BASE_URL`/`OPENAI_API_KEY`)以及最后执行调用的 `codex`。