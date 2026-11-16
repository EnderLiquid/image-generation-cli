# image-generation-cli

通过 OpenAI Image API 兼容端点生成和编辑图片的命令行工具，附带通用 skill。

## 技术栈

- TypeScript ESM
- Node.js 22+
- commander、zod
- tsup 构建
- vitest 测试

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run dev -- --help
```

本机开发使用 `npm link`，让全局 `image-generation` 指向本仓库。

## 结构

- `src/cli.ts`：命令入口
- `src/commands/`：generate、edit、config、init、doctor、skill path
- `src/config/`：配置 schema、加载、合并、密钥和脱敏
- `src/api/`：Image API 客户端
- `src/input/`：data URL 与 MIME 识别
- `src/output/`：命名、冲突检查和文件写入
- `skills/image-generation/`：通用 skill
- `docs/tasks/`：任务设计文档

## 约束

- 当前支持 `generate` 和 JSON `edit`，输出格式为 png、webp、jpeg。
- `apiUrl` 是基址，CLI 拼接 `/images/generations` 或 `/images/edits`。
- 默认不重试。图片请求可能产生费用，错误默认交给调用者。
- 配置位于 `~/.image-generation-cli`，密钥通过 `.env` 或进程环境变量提供。
- 任何输出都不得包含真实 API key、Authorization 头或 `.env` 内容。
- 默认输出目录为 `./generated`，目标文件冲突时退出码 6，`--force` 覆盖。
- 测试使用 `.pi/temp`，默认不调用真实 API。
