---
name: image-generation
description: 通过 OpenAI Image API 兼容端点生成和编辑图片。用户要求创建图片、根据提示词出图、换背景、局部修改、添加或移除画面元素、使用参考图编辑时使用。
compatibility: 需要 Node.js 22+ 和可用的 image-generation CLI。
---

# Image Generation

使用 `image-generation` CLI 调用 OpenAI Image API。CLI 负责读取配置、构造请求、保存图片并输出 JSON 结果。

## 配置

默认配置目录：

```text
~/.image-generation-cli/
├── config.json
├── .env
└── .env.example
```

- `config.json` 保存 provider、model 和输出默认值。
- `.env` 保存密钥，例如 `OPENAI_API_KEY=...`。
- `config.json` 中的 `apiKey` 使用 `${OPENAI_API_KEY}` 引用。
- 从配置文件所在目录加载 `.env`。进程环境变量优先。
- `IMAGE_GENERATION_HOME` 可覆盖配置目录，`--config` 可覆盖配置文件。

查看配置：

```bash
image-generation config
image-generation config --effective
image-generation config --effective --provider openai --model gpt-image-2.6-flare
```

`config` 会把 `apiKey` 显示为 `[REDACTED]`。不要尝试从配置或 `.env` 中回显真实密钥。

检查环境：

```bash
image-generation doctor
```

`doctor` 不会调用图片 API，不产生费用。

## 生成图片

```bash
image-generation generate --prompt "一只在雪地里提灯笼的猴子，剪纸风格"
```

常用参数：

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

- `--prompt`、`--prompt-file` 二选一；`--prompt -` 从 stdin 读取。
- `--dry-run` 输出请求 URL 和脱敏后的请求体，不调用 API。
- `--retries` 默认 0，失败不会自动重复请求。
- 输出格式支持 `png`、`webp`、`jpeg`。

## 编辑图片

```bash
image-generation edit \
  --prompt "把背景换成雪山，保留人物和光线" \
  --image ./input.png
```

多张输入：

```bash
image-generation edit \
  --prompt "让第二张的配色接近第一张" \
  --image ./reference.png \
  --image ./target.jpg
```

`--image` 支持：

- 本地路径：png、jpeg、webp
- `https://` URL

`--image` 可重复 1 到 16 次，第一张是主图。mask 和 markup 都只作用于第一张图，且不能同时使用。

mask 指定要编辑的区域：

```bash
image-generation edit \
  --prompt "把透明区域的墙改成浅灰色，保留家具" \
  --image ./room.png \
  --mask ./mask.png
```

1. 以第一张输入图为基准，把要修改的区域清为全透明（alpha 为 0）。
2. 其余区域保持不透明，保存为 PNG。
3. 宽高必须与第一张图一致。

透明区域表示要编辑的地方。模型把 mask 当作提示，可能不会严格遵循精确形状。

markup 用标注指出要修改的位置：

```bash
image-generation edit \
  --prompt "把圈出的花瓶改成蓝色，保留桌面" \
  --image ./kitchen.png \
  --markup ./overlay.png
```

1. 新建与第一张图同宽高的透明 PNG，只在上面绘制圆圈、线条、框选等标注。
2. 标注之外的区域保持透明，不要把标注层压平到原图。
3. 标注层支持 GPT-Image-2.5 和 GPT-Image-2.6。

两者都要求 PNG，宽高与第一张图一致。mask 需要 alpha 通道或 `tRNS`；markup 必须包含透明像素。使用 markup 时，第一张图和标注层各不超过 16,777,216 像素。每个 `image_url`（包括 mask 和 markup）都不超过 20,971,520 字符，本地单文件约 15MB；mask 和 markup 没有单独的大小限制。

## 输出

默认输出目录：

```text
./generated
```

相对当前工作目录。目录不存在时自动创建。建议从用户项目目录执行，或显式传 `--out-dir`。

默认文件名：

```text
image-YYYYMMDD-HHmmss-xxxx.<ext>
```

一次生成多张时追加 `-1` 到 `-n`：

```text
image-20261116-202555-3f9a-1.webp
image-20261116-202555-3f9a-2.webp
```

`--name cat` 输出 `cat.png`；多张时输出 `cat-1.png`、`cat-2.png`。

stdout 的 JSON 中 `files[].path` 是绝对路径，stderr 会输出：

```text
saved: D:\work\generated\image-20261116-202555-3f9a.webp
```

最终回复必须列出每个输出文件的绝对路径，不要只说“已生成”。

目标文件已存在时默认报错，退出码 6。需要覆盖时传 `--force`。

## 错误处理

- 错误 JSON 输出到 stderr，stdout 为空。
- 默认不重试。认证错误、400、moderation 拦截不要自动重复请求。
- moderation 错误包含 `moderation_stage` 和 `categories`。
- 退出码 2：参数或配置错误；3：认证失败；4：API 拒绝；5：网络或超时；6：写入失败或文件冲突；7：显式启用重试后仍失败。

## 参考

- `references/config.md`：配置结构、合并规则、`.env` 和脱敏。
- `references/cli.md`：命令、参数、输出和退出码。
- `references/image-api.md`：请求体、edits 输入、限制和响应。
