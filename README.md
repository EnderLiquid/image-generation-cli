# image-generation-cli

通过 OpenAI Image API 兼容端点生成和编辑图片的命令行工具。

- `image-generation`：TypeScript CLI
- `skills/image-generation`：通用 skill，可软链接到支持 skills 的 agent
- 配置：`~/.image-generation-cli`
- 输出：默认 `./generated`

## 要求

- Node.js 22 或更高版本
- 支持 `POST /images/generations` 和 `POST /images/edits` 的 OpenAI Image API 端点

## 安装

```bash
npm install
npm run build
npm link
```

或安装一份到全局：

```bash
npm install -g .
```

验证：

```bash
image-generation --version
```

## 初始化

```bash
image-generation init
```

会创建：

```text
~/.image-generation-cli/
├── config.json
├── .env.example
```

编辑 `config.json` 填入 provider、`apiUrl`、模型和默认值。复制 `.env.example` 为 `.env`，填入密钥：

```dotenv
OPENAI_API_KEY=sk-...
```

`config.json` 中使用：

```json
"apiKey": "${OPENAI_API_KEY}"
```

进程环境变量优先于 `.env`。

## 使用

生成图片：

```bash
image-generation generate --prompt "一只在雪地里的猴子"
```

指定 provider、模型和输出参数：

```bash
image-generation generate \
  --prompt-file prompt.txt \
  --provider openai \
  --model gpt-image-2.6-flare \
  --n 2 \
  --size 1536x1024 \
  --quality high \
  --output-format webp
```

编辑图片：

```bash
image-generation edit \
  --prompt "把背景换成雪山" \
  --image ./input.png
```

使用 mask 或 markup：

```bash
image-generation edit \
  --prompt "把花瓶改成蓝色" \
  --image ./kitchen.png \
  --markup ./overlay.png
```

预览请求，不调用 API：

```bash
image-generation generate --prompt "test" --dry-run
```

查看配置：

```bash
image-generation config
image-generation config --effective
```

检查环境：

```bash
image-generation doctor
```

## 输出

默认输出到当前工作目录下的 `generated/`：

```text
image-YYYYMMDD-HHmmss-xxxx.<ext>
```

多张时追加序号：

```text
image-20261116-202555-3f9a-1.png
image-20261116-202555-3f9a-2.png
```

`--name cat` 输出 `cat.png`；多张时输出 `cat-1.png`、`cat-2.png`。

stdout 输出 JSON，文件路径为绝对路径。stderr 输出：

```text
saved: D:\work\generated\image-20261116-202555-3f9a.png
```

目标文件已存在时默认报错，退出码 6。传 `--force` 覆盖。

## 重试

默认不重试。图片请求可能产生费用，CLI 把错误交给调用者处理。

需要重试时显式传：

```bash
image-generation generate --prompt "..." --retries 2
```

仅重试 408、429、5xx 和网络错误。

## Skill

本机软链接：

```bash
MSYS=winsymlinks:nativestrict ln -s /d/projects/ts/image-generation-cli/skills/image-generation \
  /c/Users/Admin/.pi/agent/skills/image-generation
```

查看打包内 skill 路径：

```bash
image-generation skill path
```

`skills/image-generation` 会包含在 npm 包中。

## 开发

```bash
npm run typecheck
npm test
npm run build
```

开发时可以直接运行：

```bash
npm run dev -- --help
```

## 当前范围

支持：

- `generate`
- `edit`，JSON edits
- png、webp、jpeg
- 多 provider、多 model
- 三级输出默认值
- `.env` 和脱敏配置
- `init`、`config`、`doctor`、`skill path`

暂不支持：

- Multipart edits
- gif、svg
- Streaming 和 `partial_images`
- Responses API 和 multi-turn editing
- Files API 的 `file_id` 输入与上传

## 文档

- skill 配置：`skills/image-generation/references/config.md`
- skill CLI：`skills/image-generation/references/cli.md`
- API 协议：`skills/image-generation/references/image-api.md`
