# Image API

CLI 使用 OpenAI Image API 的 JSON 协议。

## 端点

`apiUrl` 是 API 基址，例如：

```text
https://api.openai.com/v1
```

CLI 按命令拼接：

| 命令 | 端点 |
| --- | --- |
| `generate` | `POST {apiUrl}/images/generations` |
| `edit` | `POST {apiUrl}/images/edits` |

请求头：

```text
Content-Type: application/json
Authorization: Bearer <apiKey>
```

认证仅支持 Bearer。

## generate

```json
{
  "model": "gpt-image-2.6-flare",
  "prompt": "一只在雪地里提灯笼的猴子，剪纸风格",
  "n": 1,
  "size": "1536x1024",
  "quality": "high",
  "background": "auto",
  "output_format": "webp",
  "output_compression": 90
}
```

可选字段：

- `moderation`：`auto` 或 `low`
- `complexity`：`low`、`medium`、`high`

不发送：

- `stream`
- `partial_images`
- `response_format`
- `style`
- `user`
- `prompt_rewriter`
- `safety_identifier`

## edit

edits 使用 JSON，`images` 是 1 到 16 个输入对象的数组：

```json
{
  "model": "gpt-image-2.6-flare",
  "prompt": "把背景换成雪山，保留人物和光线",
  "images": [
    { "image_url": "data:image/png;base64,<...>" },
    { "image_url": "https://example.com/reference.webp" }
  ],
  "mask": {
    "image_url": "data:image/png;base64,<...>"
  },
  "quality": "high",
  "size": "1024x1024"
}
```

每个输入对象使用 `image_url`，取值为 HTTPS URL 或 data URL：

```json
{ "image_url": "https://example.com/image.png" }
```

```json
{ "image_url": "data:image/png;base64,<...>" }
```

官方 JSON edits 也接受 Files API 的 `file_id`，本 CLI 只发送 `image_url`，不接受 `file-...` 输入。

`mask` 和 `markup` 使用相同结构，二者不能同时出现。

```json
{
  "markup": {
    "image_url": "data:image/png;base64,<...>"
  }
}
```

- `mask` 表示替换区域。
- `markup` 表示透明 PNG 标注层。
- 本地 mask/markup 必须是 PNG。
- mask/markup 应用于第一张输入图片。

## 输入限制

- `images` 数量 1 到 16。
- 单个 `image_url` 不超过 20,971,520 字符。
- 本地图片转为 data URL 后受同一限制，单文件约 15MB。
- 本地输入支持 png、jpeg、webp。
- 本地 mask/markup 只支持 PNG。
- 图片尺寸、alpha 通道和格式一致性由 API 校验。
- 当前只使用 JSON，不使用 multipart。

## 输出格式

当前支持：

| 格式 | 扩展名 |
| --- | --- |
| `png` | `.png` |
| `webp` | `.webp` |
| `jpeg` | `.jpg` |

`output_compression` 仅对 jpeg/webp 生效，取值 0 到 100。

`background: transparent` 仅支持 png/webp。

## 尺寸

`size` 为 `auto` 或 `WIDTHxHEIGHT`：

- 宽高为 16 的倍数
- 边长不超过 3840
- 宽高比不超过 3:1
- 总像素数在 655360 到 8294400 之间

## 响应

成功响应必须包含 `data[].b64_json`：

```json
{
  "created": 1763223555,
  "data": [
    {
      "b64_json": "<base64>",
      "revised_prompt": "..."
    }
  ],
  "usage": {
    "input_tokens": 32,
    "output_tokens": 4096,
    "total_tokens": 4128
  }
}
```

CLI 的行为：

- 解码 `b64_json` 并写入文件。
- 不下载 `url`。
- 缺少 `b64_json` 时报错。
- 通过 magic bytes 判断实际 png/jpeg/webp 格式。
- 使用临时文件加 rename 写入。
- 保留 `created`、`usage`、`svg_usage` 和 request ID。
- 不把 base64 写入 stdout 或 stderr。

## 错误

错误响应通常为：

```json
{
  "error": {
    "message": "...",
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "moderation_details": {
      "moderation_stage": "input",
      "categories": ["harassment"]
    }
  }
}
```

CLI 保留：

- HTTP 状态码
- `type`
- `code`
- `message`
- `moderation_details`
- `x-request-id` 或 `request-id`

非 JSON 错误响应截取前 500 字符作为 message。

## 重试

默认不重试。显式传 `--retries` 时，只重试：

- 408
- 429
- 5xx
- 网络错误和超时

400、认证错误和 moderation 不重试。

## 当前边界

当前不包含：

- Streaming 和 `partial_images`
- Responses API
- Multi-turn editing
- Files API 的 `file_id` 输入与上传
- gif、svg
- multipart edits
- 自定义请求头
