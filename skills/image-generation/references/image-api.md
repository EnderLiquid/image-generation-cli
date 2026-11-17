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

`mask` 和 `markup` 使用相同的对象结构，二选一，不能同时出现：

```json
{
  "mask": {
    "image_url": "data:image/png;base64,<...>"
  }
}
```

### mask

`mask` 指定第一张输入图中需要编辑的区域。全透明像素（alpha 为 0）表示要编辑的地方，不透明区域表示保留。

1. 以第一张输入图为基准。
2. 把需要修改的区域清为全透明。
3. 其他区域保持不透明。
4. 保存为 PNG，宽高与第一张输入图一致。
5. 通过 `mask.image_url` 发送，并在提示词中说明希望在该区域发生的变化。

要求：

- PNG，包含 alpha 通道或 `tRNS`。
- 宽高与第一张输入图一致。
- 模型把 mask 当作提示，可能不会严格遵循精确形状。

### markup

`markup` 用圆圈、草图或其他标注告诉模型要修改哪里。

1. 保留原图作为第一张输入图片。
2. 新建与第一张图同宽高的透明 PNG，只在上面绘制圆圈、线条、框选或其他标注。
3. 保留透明像素，不要把标注层压平到原图。
4. 通过 `markup.image_url` 发送，并在提示词中说明要改什么、要保留什么。

要求：

- PNG，必须包含透明像素。
- 宽高与第一张图一致（方向校正后）。
- 第一张输入图和标注层各不超过 16,777,216 像素。
- 支持 GPT-Image-2.5 和 GPT-Image-2.6。

使用 markup 时，只把示例中的 `mask` 换成 `markup`：

```json
{
  "markup": {
    "image_url": "data:image/png;base64,<...>"
  }
}
```

### 共同限制

- 都只作用于第一张输入图，其余图片作为参考。
- 二者不能同时使用。
- 本地 mask/markup 必须是 PNG；HTTPS URL 的格式、透明度和尺寸由 API 校验。
- 每个 `image_url`（包括 mask 和 markup）都不超过 20,971,520 字符，本地单文件约 15MB；mask 和 markup 没有单独的大小限制。
- CLI 对本地 mask/markup 提前校验透明像素和与第一张图的尺寸。

## 输入限制

- `images` 数量 1 到 16。
- 单个 `image_url` 不超过 20,971,520 字符。
- 本地图片转为 data URL 后受同一限制，单文件约 15MB。
- 本地输入支持 png、jpeg、webp。
- 本地 mask/markup 只支持 PNG；mask 需要 alpha 通道或 `tRNS`，markup 需要透明像素。
- 本地 mask/markup 的宽高必须与第一张输入图一致。使用 markup 时，第一张图和标注层各不超过 16,777,216 像素。
- CLI 对本地 mask/markup 做透明像素和尺寸预检，格式、透明度和尺寸的最终判断由 API 完成。
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
