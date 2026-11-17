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

## 提示词

`generate` 和 `edit` 必须且只能提供一种提示词来源：

```bash
--prompt "提示词"
--prompt-file ./prompt.txt
--prompt -
```

`--prompt -` 从 stdin 读取。提示词长度不超过 32000 字符。

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
| `--moderation <level>` | `auto` `low` |
| `--complexity <level>` | `low` `medium` `high` |
| `--timeout <seconds>` | 单次请求超时，默认 180 |
| `--retries <count>` | 可重试错误次数，默认 0 |
| `--dry-run` | 只输出请求，不调用 API |
| `--config <path>` | 配置文件路径 |

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

### 输入图片

`--image` 可重复 1 到 16 次：

```bash
image-generation edit \
  --prompt "让第二张的配色接近第一张" \
  --image ./reference.png \
  --image ./target.jpg
```

取值支持：

- 本地路径：png、jpeg、webp
- `https://` URL

### mask 与 markup

mask 和 markup 都只作用于第一张输入图，且不能同时使用。提示词要说明要改什么、要保留什么。

mask 指定要编辑的区域：

```bash
image-generation edit \
  --prompt "把透明区域的墙改成浅灰色，保留家具" \
  --image ./input.png \
  --mask ./mask.png
```

1. 以第一张输入图为基准，把要修改的区域清为全透明（alpha 为 0）。
2. 其余区域保持不透明，保存为 PNG。
3. 宽高与第一张图一致，通过 `--mask` 传入。

透明区域表示要编辑的地方。模型把 mask 当作提示，可能不会严格遵循精确形状。

markup 用可视化标注指出要修改的位置：

```bash
image-generation edit \
  --prompt "把圈出的花瓶改成蓝色，保留桌面" \
  --image ./kitchen.png \
  --markup ./overlay.png
```

1. 保留原图作为第一张输入图。
2. 新建与第一张图同宽高的透明 PNG，只在上面绘制圆圈、线条、框选或其他标注。
3. 保留透明像素，不要把标注层压平到原图，通过 `--markup` 传入。

标注层支持 GPT-Image-2.5 和 GPT-Image-2.6。

限制：

- `--mask` 和 `--markup` 互斥。
- 本地 mask 和 markup 必须是 PNG；mask 需要 alpha 通道或 `tRNS`，markup 必须包含透明像素。
- 宽高必须与第一张图一致。
- 使用 markup 时，第一张图和标注层各不超过 16,777,216 像素。
- 每个 `image_url`（包括 mask 和 markup）都不超过 20,971,520 字符，本地单文件约 15MB；mask 和 markup 没有单独的大小限制。
- CLI 在调用 API 前检查本地 mask/markup 的透明像素和尺寸；HTTPS URL 由 API 校验。

## 输出

默认目录：

```text
./generated
```

默认文件名：

```text
image-YYYYMMDD-HHmmss-xxxx.<ext>
```

多张时追加序号：

```text
image-20261116-202555-3f9a-1.png
image-20261116-202555-3f9a-2.png
```

`--name cat`：

- 单张：`cat.png`
- 多张：`cat-1.png`、`cat-2.png`

`--name` 中的已知图片扩展名会被去掉，最终扩展名由实际输出格式决定。

目标文件已存在时默认报错，退出码 6。传 `--force` 才覆盖。

stdout 输出结果 JSON，文件路径为绝对路径。stderr 输出：

```text
saved: D:\work\generated\image-20261116-202555-3f9a.png
```

## 成功输出

```json
{
  "ok": true,
  "operation": "generate",
  "provider": "openai",
  "model": "gpt-image-2.6-flare",
  "files": [
    {
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
