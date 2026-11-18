# CLI

命令名：

```bash
image-generation
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `generate` | 根据提示词生成图片 |
| `edit` | 根据提示词和输入图片编辑图片 |
| `config` | 输出脱敏配置 |
| `config --effective` | 输出合并后的默认值和来源 |
| `init` | 初始化配置目录和示例文件 |
| `doctor` | 检查配置、密钥和路径 |
| `skill path` | 输出打包内 skill 目录的绝对路径 |

配置目录、字段和合并规则见 `config.md`。

## 提示词

`generate` 和 `edit` 必须且只能提供一种提示词来源：

```bash
--prompt "提示词"
--prompt-file ./prompt.txt
--prompt -
```

`--prompt -` 从 stdin 读取。提示词长度不超过 32000 字符。提示词写法见 `prompting.md`。

## 公共参数

| 参数 | 说明 |
| --- | --- |
| `--provider <name>` | 覆盖默认 provider |
| `--model <name>` | 覆盖默认 model |
| `--out-dir <dir>` | 输出目录，默认 `./generated` |
| `--name <base>` | 文件名前缀 |
| `--force` | 覆盖已存在的目标文件 |
| `--n <number>` | 生成张数 1 到 10 |
| `--size <size>` | `auto` 或 `WIDTHxHEIGHT` |
| `--quality <quality>` | `low` `medium` `high` `xhigh` `max` `auto` |
| `--background <background>` | `transparent` `opaque` `auto` |
| `--output-format <format>` | `png` `webp` `jpeg` |
| `--output-compression <number>` | 0 到 100，仅 jpeg/webp |
| `--response-format <format>` | `url` `b64_json`；兼容中转，默认省略 |
| `--moderation <level>` | `auto` `low` |
| `--complexity <level>` | `low` `medium` `high` |
| `--timeout <seconds>` | 单次请求超时，默认 180 |
| `--retries <count>` | 可重试错误次数，默认 0 |
| `--dry-run` | 只输出请求，不调用 API |
| `--config <path>` | 配置文件路径 |

### size

`--size` 取 `auto` 或 `WIDTHxHEIGHT`，并满足：

- 宽高为 16 的倍数。
- 边长不超过 3840。
- 宽高比不超过 3:1。
- 总像素数在 655360 到 8294400 之间。

示例：

```text
auto
1024x1024
1536x1024
2048x2048
3840x2160
```

### 输出格式

| 格式 | 扩展名 | 说明 |
| --- | --- | --- |
| `png` | `.png` | 支持透明背景 |
| `webp` | `.webp` | 支持透明背景和压缩 |
| `jpeg` | `.jpg` | 支持压缩，不支持透明背景 |

`--output-compression` 仅对 jpeg/webp 生效。`--background transparent` 仅支持 png/webp。

## generate

```bash
image-generation generate --prompt "一只在雪地里的猴子"
```

```bash
image-generation generate \
  --prompt-file prompt.txt \
  --provider openai \
  --model gpt-image-2.6-flare \
  --n 2 \
  --size 1536x1024 \
  --quality high \
  --output-format webp \
  --out-dir ./generated
```

## edit

```bash
image-generation edit \
  --prompt "把背景换成雪山" \
  --image ./input.png
```

`--image` 可重复 1 到 16 次，支持本地 png、jpeg、webp 和 `https://` URL。

`--mask` 和 `--markup` 只作用于第一张输入图，两者不能同时使用。制作步骤、透明语义和输入限制见 `editing.md`。多图编辑的提示词写法见 `prompting.md`。

## 输出

默认目录：

```text
./generated
```

相对当前工作目录。目录不存在时自动创建。

默认文件名：

```text
image-YYYYMMDD-HHmmss-xxxx.<ext>
```

多张时追加序号：

```text
image-20261116-202555-3f9a-1.png
image-20261116-202555-3f9a-2.png
```

`--name cat` 输出 `cat.png`；多张时输出 `cat-1.png`、`cat-2.png`。响应中的 `url` 会写成同名的 `.txt` 文件，内容为一行 URL 加换行；CLI 不下载 URL 内容。`--name` 中的已知扩展名会被去掉，最终扩展名由实际产物决定。名称不能包含路径分隔符或 Windows 保留字符。

目标文件已存在时默认报错，退出码 6。传 `--force` 才覆盖。

stdout 输出结果 JSON，文件路径为绝对路径。

## 成功输出

```json
{
  "ok": true,
  "operation": "generate",
  "provider": "openai",
  "model": "gpt-image-2.6-flare",
  "files": [
    {
      "kind": "image",
      "path": "D:/work/generated/image-20261116-202555-3f9a.webp",
      "bytes": 284512,
      "format": "webp"
    }
  ],
  "request": {
    "output_format": "webp",
    "quality": "high",
    "size": "1536x1024",
    "n": 1
  },
  "created": 1763223555,
  "requestId": "req_...",
  "usage": {
    "input_tokens": 32,
    "output_tokens": 4096,
    "total_tokens": 4128
  },
  "elapsedMs": 18432
}
```

`operation` 为 `generate` 或 `edit`。edits 的 `request` 只包含输入数量、mask/markup 标记和输出参数，不包含图片数据。

`files[].kind` 为 `image` 或 `url`。`url` 产物没有 `format` 字段，`path` 指向包含 URL 的 `.txt`：

```json
{
  "kind": "url",
  "path": "D:/work/generated/image-20261116-202555-3f9a-2.txt",
  "bytes": 96
}
```

## dry-run

```bash
image-generation generate --prompt "test" --dry-run
```

输出：

```json
{
  "ok": true,
  "dryRun": true,
  "operation": "generate",
  "provider": "openai",
  "model": "gpt-image-2.6-flare",
  "url": "https://api.openai.com/v1/images/generations",
  "request": {
    "model": "gpt-image-2.6-flare",
    "prompt": "test",
    "output_format": "png"
  },
  "output": {
    "dir": "D:/work/generated",
    "files": ["D:/work/generated/image-...png"]
  }
}
```

`--dry-run` 不调用 API，不解析密钥。edits 中的 data URL 会压缩为 `[data-url ...]` 占位符。

## 错误输出

错误时 stdout 为空，stderr 输出 JSON：

```json
{
  "ok": false,
  "error": {
    "kind": "api",
    "status": 400,
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "message": "...",
    "moderation": {
      "stage": "input",
      "categories": ["harassment"]
    },
    "requestId": "req_..."
  }
}
```

## 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 未预期的内部错误 |
| 2 | 参数或配置错误 |
| 3 | 认证失败 |
| 4 | API 拒绝请求，含 moderation |
| 5 | 网络错误或超时 |
| 6 | 文件写入失败或目标冲突 |
| 7 | 显式启用重试后仍失败 |

## 重试

- 默认 0 次，不自动重复请求。
- `--retries <count>` 显式启用。
- 仅重试 408、429、5xx 和网络错误。
- 遵循 `Retry-After`，使用指数退避。
- 400、认证错误和 moderation 不重试。

## skill 路径

```bash
image-generation skill path
```

输出打包内 `skills/image-generation` 的绝对路径。本机可以用它创建软链接。
