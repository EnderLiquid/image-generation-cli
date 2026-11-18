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

可选字段：`moderation`、`complexity`、`response_format`。CLI 的短横线参数对应请求中的下划线字段，例如 `--output-format` 对应 `output_format`。

`response_format` 取 `url` 或 `b64_json`。OpenAI 已标记该字段废弃，CLI 默认不发送；只有兼容中转明确需要时再设置。实际响应以 `data` 中的字段为准。

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

`mask` 和 `markup` 使用相同的对象结构，二选一：

```json
{
  "markup": {
    "image_url": "data:image/png;base64,<...>"
  }
}
```

mask 和 markup 的语义、制作步骤和输入限制见 `editing.md`。

## 响应

成功响应包含 `data[].b64_json` 或 `data[].url`：

```json
{
  "created": 1763223555,
  "data": [
    {
      "b64_json": "<base64>",
      "revised_prompt": "..."
    },
    {
      "url": "https://example.com/image.png"
    }
  ],
  "usage": {
    "input_tokens": 32,
    "output_tokens": 4096,
    "total_tokens": 4128
  }
}
```

CLI 优先解码 `b64_json`，按实际图片格式写入文件；缺少 `b64_json` 时取 `url`，将 URL 写入 `.txt` 文件，不下载内容。`url` 必须是 http/https 地址，否则按 API 响应错误处理。`created`、`usage`、`svg_usage` 和 request ID 会保留在 CLI 的输出 JSON 中。

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

CLI 保留 HTTP 状态码、`type`、`code`、`message`、`moderation_details` 和 `x-request-id` 或 `request-id`。非 JSON 错误响应截取前 500 字符作为 message。
