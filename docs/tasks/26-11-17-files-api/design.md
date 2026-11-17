# 从 CLI 输入中移除 Files API file_id

- 状态：调查完成，待实施
- 日期：2026-11-17
- 范围：`--image`、`--mask`、`--markup` 的输入解析、API 类型、测试、skill 与 README

## 背景

需要确认 Files API 上传得到的 `file-...` ID 能否用于 Image API 的 JSON edits，并评估在 OpenAI 兼容中转上的可用性。

## 官方文档

### Images Edit API 支持 file_id

官方 REST 参考的 JSON 请求体定义：

> `images: array of object { file_id, image_url }`
>
> - `file_id: optional string`
>   The File API ID of an uploaded image to use as input.
> - `image_url: optional string`
>   A fully qualified URL or base64-encoded data URL.

`mask` 和 `markup` 也接受同样结构：

> `mask: optional object { file_id, image_url }`
>
> `markup: optional object { file_id, image_url }`

同一页提供了名为 `JSON request with uploaded file id` 的示例（节选）：

```json
{
  "images": [{ "file_id": "file-abc123" }],
  "prompt": "Replace the background with a snowy mountain scene",
  "mask": { "file_id": "file-mask123" },
  "model": "gpt-image-1.5"
}
```

来源：<https://developers.openai.com/api/reference/resources/images/methods/edit>

官方示例使用 `gpt-image-1.5`，字段定义本身没有把 `file_id` 限定到某个模型。

因此，“Image API 完全不支持 file_id”的说法不成立。官方 Image API 的 JSON edits 明确接受 Files API ID。

### Files API 的资源属性

Files API 把上传文件保存为独立的 `file-...` 资源，`purpose` 包含 `vision`、`user_data` 等值。`file_id` 只引用该资源，不包含图片本身。

来源：<https://developers.openai.com/api/reference/resources/files>

## 兼容性判断

官方支持不等于本 CLI 应当支持。`file_id` 有以下问题：

- 它是 OpenAI 平台资源，要求中转同时实现 Files API 和 Images edits，并共享文件存储。
- 不少 OpenAI 兼容中转只实现 `/images/generations` 和 `/images/edits`，不实现 `/files`。
- `file-...` 无法在客户端校验内容、格式和可访问性，错误通常在请求提交后才暴露。
- CLI 本身不上传文件，要求用户先手工上传，增加一步平台相关操作。

本地文件和 HTTPS URL 已经覆盖通用场景。本地文件在 CLI 内转换为 data URL，HTTPS URL 直接作为 `image_url` 发送，两者都是 Image API JSON 的自包含输入。

## 决策

- CLI 不接受 `file-...` 作为 `--image`、`--mask`、`--markup` 的值。
- CLI 不实现 Files API 上传。
- 保留本地文件和 HTTPS URL。
- 文档明确说明：官方 OpenAI 支持 `file_id`，本工具出于兼容性不支持。
- 不使用“OpenAI Image API 不支持 file_id”作为错误提示或文档结论。

## 实施

1. `src/input/data-url.ts`
   - 删除 `value.startsWith("file-")` 分支。
   - 对 `file-...` 输入给出明确参数错误，退出码 2。
   - 错误信息建议：`不支持 Files API file_id，请使用本地文件或 HTTPS URL`。
2. `src/api/types.ts`
   - `ImageInput` 只保留 `image_url`，删除 `file_id`。
3. 测试
   - 增加用例：`--image file-abc123` 退出码 2。
   - 增加用例：请求体中的 `images`、`mask`、`markup` 不出现 `file_id`。
   - 保留 HTTPS URL 和本地 data URL 用例。
4. 文档
   - 删除 `skills/image-generation/SKILL.md` 中的 `file-...` Files API ID 说明。
   - 删除 `skills/image-generation/references/cli.md` 的 `file-...` 输入说明。
   - 删除 `skills/image-generation/references/image-api.md` 的 `file_id` 请求示例。
   - 更新 README 的当前边界：改为 Files API `file_id` 与上传均不支持。

## 验收

- `image-generation edit --image file-abc123 --prompt ...` 以参数错误退出，退出码 2。
- `--image https://...` 和本地文件仍然可用。
- 请求体不含 `file_id`。
- skill 文档不再把 `file-...` 描述为可用输入。
- 文档明确区分“官方 API 支持”和“本 CLI 不支持”。

## 参考

- <https://developers.openai.com/api/reference/resources/images/methods/edit>
- <https://developers.openai.com/api/reference/resources/files>
