---
name: image-generation
description: 通过 OpenAI Image API 兼容端点生成和编辑图片。需要调用图片生成模型时使用。
compatibility: 需要 Node.js 22+ 和可用的 image-generation CLI。
---

# Image Generation

使用 `image-generation` CLI 调用 OpenAI Image API。CLI 负责读取配置、构造请求、保存图片并输出 JSON 结果。

## 使用须知

调用图片生成模型会产生真实 API 费用。使用前先确认预算和调用规模，包括张数、尺寸和质量档位。

不同 provider 和模型支持的参数不同。CLI 不按模型名拦截，字段是否可用以服务端支持情况为准。

## 快速开始

生成图片：

```bash
image-generation generate \
  --prompt "一只在雪地里提灯笼的猴子，剪纸风格" \
  --out-dir ./generated \
  --name monkey-papercut
```

编辑图片：

```bash
image-generation edit \
  --prompt "把背景换成雪山，保留人物和光线" \
  --image ./input.png \
  --out-dir ./generated \
  --name snow-scene
```

查看配置和环境：

```bash
image-generation config --effective
image-generation doctor
```

`doctor` 不调用图片 API。默认配置目录为 `~/.image-generation-cli/`，可用 `IMAGE_GENERATION_HOME` 或 `--config` 覆盖。密钥写在 `apiKey` 中，可用 `${OPENAI_API_KEY}` 引用进程环境变量或配置目录下的 `.env`；`config` 会显示为 `[REDACTED]`。配置结构和合并规则见 `references/config.md`。

## 编辑方式

| 场景 | 用法 |
| --- | --- |
| 整体改、换背景 | 一张 `--image` 加提示词 |
| 多图融合、风格或人物参考 | 重复 `--image`，最多 16 张 |
| 指定区域替换 | `--mask`，透明区域表示要改的地方 |
| 圈选、标注位置 | `--markup`，在单独的透明 PNG 上画标注 |

mask 和 markup 只作用于第一张输入图，不作用于后续图片，两者不能同时使用。多图编辑时，在提示词里按序号说明每张图的角色。制作步骤、透明语义和输入限制见 `references/editing.md`。

## 默认偏好

- 先用 `--n 1` 生成一张，检查满意就停止；需要更多再追加，避免为未使用的候选图付费。
- 不主动调整 `--quality`、`--complexity`、`--output-format`、`--output-compression` 和 `--response-format`。省略后使用配置或模型默认值。
- 默认 PNG 是无损的；JPEG 不支持透明，WebP/JPEG 的压缩可能降低质量。没有下游格式要求时保持默认。默认效果不足时，再按 `references/prompting.md` 使用逃逸质量档位。

## 提示词

编辑提示词采用“只改 X，保留 Y，不要 Z”的结构，一次只改一件事。生成图片时先写主体和用途，再写构图、材质、光线和限制。精确文字用引号写出原文，并说明位置和出现次数。

完整写法和示例见 `references/prompting.md`。

## 产物

- 默认输出到执行目录下的 `./generated`，文件名默认包含时间戳与随机后缀。推荐显式传 `--out-dir` 与 `--name`。
- 目标文件已存在时默认报错，退出码 6；只有任务明确要求覆盖时才传 `--force`。
- `files[].kind` 为 `url` 时，产物是包含一行 URL 的 `.txt`，CLI 不下载内容；需要图片时读取该文件并自行下载。签名 URL 可能很快过期。
- 生成后读取输出图片检查结果。确认文字可读、身份和产品细节保留、修改范围符合要求、透明背景确实透明等。

## 失败处理

错误 JSON 输出到 stderr，stdout 为空。默认不重试，认证错误、400 和 moderation 拦截不要自动重复请求。输出冲突时不要自行加 `--force`。错误字段、退出码和重试规则见 `references/cli.md`。

## 参考

| 文件 | 何时读取 |
| --- | --- |
| `references/cli.md` | 查命令、参数、输出命名、退出码和重试规则 |
| `references/editing.md` | 准备多图输入、mask 或 markup |
| `references/prompting.md` | 编写提示词、选择模型和参数、生成后检查 |
| `references/config.md` | 配置 provider、模型、密钥或代理 |
| `references/image-api.md` | 核对端点、请求体和响应结构 |
