# Switch Claude CLI

[![npm version](https://badge.fury.io/js/switch-claude-cli.svg)](https://www.npmjs.com/package/switch-claude-cli)
[![Tests](https://github.com/yak33/switch-claude-cli/actions/workflows/test.yml/badge.svg)](https://github.com/yak33/switch-claude-cli/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/badge/coverage-95.62%25-brightgreen)]()
[![GitHub license](https://img.shields.io/github/license/yak33/switch-claude-cli)](https://github.com/yak33/switch-claude-cli/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/yak33/switch-claude-cli)](https://github.com/yak33/switch-claude-cli/issues)
[![GitHub stars](https://img.shields.io/github/stars/yak33/switch-claude-cli)](https://github.com/yak33/switch-claude-cli/stargazers)

一个智能的 Claude API Provider 切换工具，帮助你在多个第三方 Claude API 服务之间快速切换。

## 🌍 多语言文档

**[🇨🇳 中文](README.md)** | **[🇺🇸 English](README.en.md)** | **[🇯🇵 日本語](README.ja.md)**

👉 开发初衷见我的微信公众号文章：[我受够了复制粘贴 Claude Code API ，于是写了个工具，3秒自动切换](https://mp.weixin.qq.com/s/5A5eFc-l6GHBu_qxuLdtIQ)

## 📋 文档和更新

- 📄 **[更新日志](CHANGELOG.md)** - 查看所有版本更新记录

## ✨ 功能特性

- 🚀 **智能检测**：自动检测 API 可用性，支持多端点测试和重试机制
- ⚡ **缓存机制**：5分钟内缓存检测结果，避免重复检测
- 🎯 **灵活选择**：支持自动选择默认 provider 或交互式手动选择
- 🔧 **配置管理**：完整的 provider 增删改查功能
- 📊 **详细日志**：可选的详细模式显示响应时间和错误信息
- 🛡️ **错误处理**：完善的错误处理和用户友好的提示信息
- 🔔 **版本更新**：自动提醒用户更新到最新版本
- 📦 **配置备份**：支持导出、导入、备份和恢复配置
- 📺 **优化显示**：显示完整API名称，智能适应终端宽度
- ✨ **TypeScript重构**：v1.4.0 新增！完全 TypeScript 重构，类型安全，模块化架构
- 📈 **使用统计**：v1.4.0 新增！记录使用统计，支持导出和重置功能
- 🌐 **代理支持**：v1.4.2 新增！支持为每个 Provider 配置 HTTP/HTTPS 代理

## 📦 安装

### 系统要求

- **Node.js**: 18.0.0 或更高版本
- **npm**: 8.0.0 或更高版本（或 yarn 1.22+）
- **操作系统**: Windows、macOS、Linux

### 从 NPM 安装（推荐）

```bash
npm install -g switch-claude-cli
```

### 从源码安装

```bash
git clone https://github.com/yak33/switch-claude-cli.git
cd switch-claude-cli
npm install
npm run build
npm link
```

**注意**：从 v1.4.0 开始，项目使用 TypeScript，需要先构建再安装。

## 🚀 快速开始

### 1. 安装后首次运行

```bash
switch-claude
# 或使用快捷命令
scl
```

首次运行时，工具会自动：

- 创建配置目录 `~/.switch-claude`
- 生成示例配置文件 `~/.switch-claude/providers.json`
- 提供编辑配置的命令

### 2. 编辑配置文件

根据提示编辑配置文件：

```bash
# Windows
notepad "C:\Users\YourName\.switch-claude\providers.json"

# macOS
open ~/.switch-claude/providers.json

# Linux
nano ~/.switch-claude/providers.json
```

将示例内容替换为你的真实 API 信息：

```json
[
  {
    "name": "Veloera",
    "baseUrl": "https://zone.veloera.org",
    "key": "sk-your-real-api-key-here",
    "default": true
  },
  {
    "name": "NonoCode",
    "baseUrl": "https://claude.nonocode.cn/api",
    "key": "cr_your-real-api-key-here"
  },
  {
    "name": "AnyRouter-WithProxy",
    "baseUrl": "https://api.anyrouter.com",
    "key": "sk-your-real-api-key-here",
    "proxy": "http://127.0.0.1:7897"
  }
]
```

**代理配置说明** 🌐：

- 如果某个 API 提供方需要通过代理访问（如 VPN），可以在配置中添加 `proxy` 字段
- `proxy` 格式：`http://代理地址:端口`（例如：`http://127.0.0.1:7897`）
- 未配置 `proxy` 字段的 Provider 会直接连接，不使用代理

### 3. 再次运行开始使用

```bash
switch-claude
```

## 📖 使用方法

### 快捷命令 ⚡

为了简化输入，工具提供了多个命令别名，完全等价于 `switch-claude`：

```bash
# 以下命令完全等价
switch-claude        <==>  scl  <==>  ccc
switch-claude 1      <==>  scl 1      <==>  ccc 1
switch-claude -v     <==>  scl -v     <==>  ccc -v
switch-claude --list <==>  scl --list <==>  ccc --list
```

**别名说明**：

- `switch-claude` - 完整命令，语义清晰
- `scl` - Switch CLaude 首字母缩写
- `ccc` - Choose Claude CLI 缩写

### 基本用法

```bash
# 交互式选择 provider
switch-claude
# 或
scl
# 或
ccc

# 直接选择编号为 1 的 provider
scl 1

# 仅 Claude 模式：只设置环境变量，不启动 Claude Code
scl -e 1

# 查看版本并检查更新
scl --version
```

### Codex 模式

```bash
# 交互式选择 Codex provider
switch-claude --codex

# 直接选择 Codex provider，并写入 ~/.codex/config.toml 后启动 codex
switch-claude --codex 1
```

**说明**：

- Codex 模式不再通过环境变量注入 `baseUrl` 和 `key`
- 工具会直接更新 `~/.codex/config.toml` 中 `[model_providers.x]` 下的 `name`、`base_url` 与 `experimental_bearer_token`
- `--env-only` 仅适用于 Claude 模式，不适用于 `--codex`

### 检测和缓存

```bash
# 强制刷新缓存，重新检测所有 provider
scl --refresh

# 显示详细的检测信息（响应时间、错误详情等）
scl -v 1
```

### 配置管理

```bash
# 列出所有 providers
switch-claude --list

# 添加新的 provider
switch-claude --add

# 编辑编号为 2 的 provider
switch-claude --edit 2

# 删除编号为 2 的 provider
switch-claude --remove 2

# 设置编号为 1 的 provider 为默认
switch-claude --set-default 1

# 清除默认设置（每次都需要手动选择）
switch-claude --clear-default
```

### 配置备份与恢复 📦 v1.3.0

```bash
# 导出配置到文件（自动添加时间戳）
switch-claude --export

# 导出到指定文件
switch-claude --export my-providers.json

# 从文件导入配置（替换现有配置）
switch-claude --import backup.json

# 导入并合并（不会覆盖已有的同名 provider）
switch-claude --import new-providers.json --merge

# 备份到系统目录（~/.switch-claude/backups/）
switch-claude --backup

# 查看所有备份
switch-claude --list-backups
```

**功能特点**：

- 🔒 导入前自动备份原配置
- 🔄 支持合并导入，避免覆盖现有配置
- 📅 导出文件包含版本和时间信息
- 🗑️ 自动清理旧备份（保留最近10个）
- 📁 备份存储在 `~/.switch-claude/backups/` 目录

### 版本更新 🆕 v1.3.0

```bash
# 查看当前版本并检查更新
switch-claude --version
# 或
switch-claude -V

# 手动检查更新
switch-claude --check-update
```

**自动更新提醒**：

- 🔔 每次运行时自动检查是否有新版本（每6小时检查一次）
- 📦 如果有新版本，会显示醒目的黄色边框提示
- 🚀 提供便捷的更新命令

### 使用统计 📊 v1.4.0

```bash
# 查看使用统计信息
switch-claude --stats

# 导出统计数据到文件
switch-claude --export-stats
switch-claude --export-stats my-stats.json

# 重置所有统计数据
switch-claude --reset-stats
```

**统计功能特点**：

- 📈 **命令使用统计**：记录每个命令的使用频率和时间
- 🎯 **Provider 性能统计**：跟踪每个 API 提供商的成功率和响应时间
- ⏰ **24小时使用分布**：可视化显示使用时间分布
- 🐛 **错误统计分析**：记录和分析各种错误类型
- 📤 **数据导出**：支持导出统计数据到 JSON 文件
- 🔄 **数据重置**：支持清空所有统计数据

**统计数据存储**：

- 统计数据存储在 `~/.switch-claude/usage-stats.json`
- 数据会自动保存，无需手动操作
- 重装或升级时统计数据会保留

### 帮助信息

```bash
# 显示完整帮助
switch-claude --help
```

## 🔧 命令行选项

| 选项                      | 简写 | 描述                                               |
| ------------------------- | ---- | -------------------------------------------------- |
| `--help`                  | `-h` | 显示帮助信息                                       |
| `--version`               | `-V` | 显示版本信息并检查更新                             |
| `--refresh`               | `-r` | 强制刷新缓存，重新检测所有 provider                |
| `--verbose`               | `-v` | 显示详细的调试信息                                 |
| `--list`                  | `-l` | 只列出 providers 不启动应用                        |
| `--env-only`              | `-e` | 仅 Claude 模式：只设置环境变量，不启动 Claude Code |
| `--add`                   |      | 添加新的 provider                                  |
| `--remove <编号>`         |      | 删除指定编号的 provider                            |
| `--set-default <编号>`    |      | 设置指定编号的 provider 为默认                     |
| `--clear-default`         |      | 清除默认 provider（每次都需要手动选择）            |
| `--check-update`          |      | 手动检查版本更新                                   |
| `--export [文件名]`       |      | 导出配置到文件                                     |
| `--import <文件名>`       |      | 从文件导入配置                                     |
| `--merge`                 |      | 与 --import 配合使用，合并而不是替换               |
| `--backup`                |      | 备份当前配置到系统目录                             |
| `--list-backups`          |      | 列出所有备份文件                                   |
| `--stats`                 |      | 显示使用统计信息                                   |
| `--export-stats [文件名]` |      | 导出统计数据到文件                                 |
| `--reset-stats`           |      | 重置所有统计数据                                   |

## 📁 配置文件位置

### 配置目录结构

```
~/.switch-claude/
├── providers.json    # API 配置文件
├── cache.json       # 检测结果缓存
├── usage-stats.json       # 使用统计数据 (v1.4.0+)
└── backups/         # 备份文件目录
    ├── backup-2024-09-22T10-30-00.json
    └── backup-2024-09-22T14-15-30.json
```

**配置目录位置**：

- **Windows**: `C:\Users\YourName\.switch-claude\`
- **macOS**: `/Users/YourName/.switch-claude/`
- **Linux**: `/home/YourName/.switch-claude/`

### providers.json

```json
[
  {
    "name": "Provider名称", // 必需：显示名称
    "baseUrl": "https://api.url", // 必需：API Base URL
    "key": "your-api-key", // 必需：API Key（支持各种格式）
    "default": true // 可选：是否为默认 provider
  }
]
```

### 配置安全

- **自动创建**：首次运行自动创建配置目录和示例文件
- **用户目录**：配置文件存储在用户主目录下，避免权限问题
- **API Key 保护**：显示时会被部分遮码（只显示前12位）
- **缓存隔离**：每个用户的缓存文件独立存储

## 🎯 使用场景

### 场景一：有稳定的主要 Provider

1. 设置一个默认 provider：

```bash
switch-claude --set-default 1
```

2. 日常使用（自动选择默认）：

```bash
switch-claude
```

3. 临时切换到其他 provider：

```bash
switch-claude 2
```

### 场景二：经常切换 Provider

1. 清除默认设置：

```bash
switch-claude --clear-default
```

2. 每次运行都会显示选择界面：

```bash
switch-claude
```

### 场景三：调试和测试

1. 详细模式查看所有信息：

```bash
switch-claude -v --refresh
```

2. 只设置环境变量，手动运行 Claude Code：

```bash
switch-claude -e 1
claude
```

## 🔍 API 检测机制

工具使用多层检测策略确保 API 可用性：

1. **轻量级检测**：首先尝试 `GET /v1/models`
2. **功能性检测**：然后尝试 `POST /v1/messages`（最小 token 请求）
3. **重试机制**：每个端点最多重试 3 次
4. **超时控制**：单次请求超时 8 秒
5. **错误分类**：区分网络错误、认证错误、服务错误等

## 🗂️ 缓存机制

- **缓存时长**：5分钟
- **缓存文件**：`cache.json`
- **缓存标识**：基于 baseUrl 和 API Key 的后8位
- **强制刷新**：使用 `--refresh` 参数

## ❗ 错误处理

{{ ... }}

如果遇到 "spawn claude ENOENT" 错误：

1. **检查安装**：确保 Claude Code 已正确安装
2. **检查 PATH**：确保 claude 命令在系统 PATH 中
3. **使用 --env-only（仅 Claude 模式）**：

```bash
switch-claude -e 1
# 然后手动运行
claude
```

### API 连接问题

常见错误及解决方案：

- **DNS解析失败**：检查网络连接和 URL 正确性
- **连接被拒绝**：检查防火墙设置
- **连接超时**：网络问题或服务不可用
- **HTTP 401**：API Key 无效或过期
- **HTTP 403**：权限不足或配额用完

## 🔒 安全注意事项

### 配置文件安全

- **用户目录隔离**：配置文件存储在 `~/.switch-claude/` 下，每个用户独立
- **自动初始化**：首次运行自动创建配置目录和示例文件
- **API Key 保护**：显示时会被部分遮码（只显示前12位）
- **文件权限**：在 Unix 系统上建议设置适当的文件权限：
  ```bash
  chmod 700 ~/.switch-claude          # 仅所有者可访问目录
  chmod 600 ~/.switch-claude/*        # 仅所有者可读写文件
  ```

### 数据安全

- ✅ 配置文件存储在用户目录，不会影响其他用户
- ✅ 缓存文件独立存储，避免冲突
- ✅ 敏感信息不会记录到日志中
- ⚠️ **定期轮换** API Key 以确保安全
- ⚠️ **谨慎分享** 配置文件或截图

## 🔧 开发

### 代码规范

```bash
# 运行 ESLint 检查
npm run lint

# 自动修复 ESLint 问题
npm run lint:fix

# 运行 Prettier 格式化
npm run format

# 检查 Prettier 格式
npm run format:check
```

### 测试

```bash
# 运行所有测试
npm test

# 观察模式
npm run test:watch

# 测试覆盖率
npm run test:coverage
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🆘 常见问题

### Q: 如何添加新的 provider？

A: 使用 `switch-claude --add` 命令，按提示输入信息。

### Q: 如何备份配置？

A: 有多种方式：

- 使用 `switch-claude --export` 导出到文件
- 使用 `switch-claude --backup` 自动备份到系统目录
- 手动复制 `~/.switch-claude/providers.json` 文件

### Q: 工具支持哪些平台？

A: 支持 Windows、macOS 和 Linux。

### Q: 如何更新工具？

A: 工具会自动提醒你更新！你也可以：

- 运行 `switch-claude --version` 查看是否有新版本
- 运行 `switch-claude --check-update` 手动检查更新
- 使用 `npm update -g switch-claude-cli` 更新到最新版本

### Q: 缓存文件可以删除吗？

A: 可以。删除 `cache.json` 不会影响功能，只是下次运行会重新检测。

---

**项目地址**: [GitHub](https://github.com/yak33/switch-claude-cli)  
**问题反馈**: [Issues](https://github.com/yak33/switch-claude-cli/issues)  
**NPM 包**: [switch-claude-cli](https://www.npmjs.com/package/switch-claude-cli)  
**更新日志**: [CHANGELOG.md](CHANGELOG.md)
