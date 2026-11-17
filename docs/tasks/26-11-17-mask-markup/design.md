# 澄清 mask 与 markup 的用法

- 状态：调查完成，待实施
- 日期：2026-11-17
- 范围：skill 文档、`edit` 帮助文本、可选的输入校验

## 背景

当前 skill 只说明了“mask 表示替换区域”“markup 是透明 PNG 标注层”，没有讲清如何制作、哪些区域会生效、尺寸和 alpha 要求、文件大小限制、模型支持，以及两者都只作用于第一张输入图片。

这会导致 agent 生成错误的 mask 或 markup，或者把标注层压平到原图后提交。

## 官方规则

### 共同规则

- `mask` 和 `markup` 都只作用于第一张输入图片；其余图片作为参考。
- 两者不能同时使用。
- JSON edits 的输入图片放在 `images` 数组；官方 API 的 `mask` 和 `markup` 对象接受 `image_url` 或 `file_id`。
- 本 CLI 只使用 `image_url`：本地文件转为 base64 data URL，HTTPS URL 直接发送。
- 编辑提示词需要描述要改什么，以及要保留什么。

### mask

用途：指定需要编辑的区域。

官方定义：

> An additional image whose fully transparent areas (e.g. where alpha is zero) indicate where `image` should be edited. If there are multiple images provided, the mask will be applied on the first image. Must be a valid PNG file, less than 4MB, and have the same dimensions as `image`.

用法：

1. 以第一张输入图为基准。
2. 确认需要修改的区域。
3. 把这些区域的像素清为全透明，alpha 为 0。透明区域表示要编辑的地方。
4. 其他区域保持不透明。
5. 保存为带 alpha 通道的 PNG。
6. 通过 `mask` 发送，提示词描述希望在该区域发生的变化。

要求：

- 必须是合法 PNG。
- 必须包含 alpha 通道。
- 宽高必须与第一张输入图一致。
- API 参考给出的 mask 大小上限是 4MB。
- 模型把 mask 当作提示，可能不会严格遵循精确形状。
- 没有找到按模型版本限制 mask 的说明，按 GPT Image 模型通用能力处理。

### mask 文档差异

官方指南另有一句“image to edit and mask must be of the same format and size (less than 50MB in size)”。API 参考的字段说明更具体：

- mask 必须是合法 PNG。
- mask 小于 4MB。
- mask 与 `image` 尺寸一致。

输入图片可以是 png、jpeg 或 webp，而 mask 必须是 PNG，因此“同格式”不能按字面理解为输入图和 mask 都使用同一格式。实现按 API 参考处理：mask 统一为 PNG，尺寸与第一张图一致，大小按更严格的 4MB 限制。

### markup

用途：通过圆圈、草图或其他标注告诉模型要修改哪里。

官方步骤：

> 1. Keep the original image as the first input image.
> 2. Create a separate transparent PNG containing your circles, sketches, or other annotations. After orientation, the annotation layer and the first image must have the same width and height. The PNG must contain transparent pixels; do not flatten it onto the original image.
> 3. Send the annotation layer as `markup`. Multipart requests accept a file upload. JSON requests accept an object containing exactly one of `image_url` or `file_id`; `image_url` can contain an HTTPS URL or a base64 data URL. JSON edit requests use `images` for the input image array.
> 4. Describe the requested change and the details you want to preserve. Review the result before using it.

用法：

1. 原图必须作为第一张输入图片。
2. 另建一张与第一张图同宽高的透明 PNG。
3. 只在透明画布上绘制圆圈、线条、框选或其他标注。
4. 标注层必须保留透明像素，不要把标注层压平到原图。
5. 通过 `markup` 发送。
6. 在提示词中说明要改什么、要保留什么，并检查结果。

要求和限制：

- 标注层与第一张图在方向校正后必须宽高一致。
- 标注层必须包含透明像素。
- 第一张输入图和标注层各自最多 16,777,216 像素。
- 标注文件最大 50MB。
- 标注层不能和 `mask` 同时使用。
- 官方指南说明 markup 支持 GPT-Image-2.5 和 GPT-Image-2.6；API 参考当前只写了 GPT Image 2.5。文档按 2.5/2.6 支持描述。

## mask 与 markup 对比

| 项目 | mask | markup |
| --- | --- | --- |
| 目的 | 指定需要替换或编辑的区域 | 用可视化标注指出要修改的位置 |
| 画布 | 从第一张图出发，把目标区域清成透明 | 从透明画布出发，只绘制标注 |
| 透明区域含义 | 要编辑的区域 | 没有标注的背景，必须保留透明 |
| 格式 | PNG，含 alpha | PNG，含透明像素 |
| 尺寸 | 与第一张图一致 | 与第一张图一致 |
| 作用对象 | 第一张输入图 | 第一张输入图 |
| 同时使用 | 不可与 markup 组合 | 不可与 mask 组合 |
| 模型支持 | GPT Image 模型 | GPT-Image-2.5、GPT-Image-2.6 |

## 当前文档与实现缺口

### 文档

- `skills/image-generation/SKILL.md`
  - 只写了“mask 或 markup 二选一”“本地 mask 和 markup 必须是 PNG”。
  - 没有写透明区域的含义、alpha 要求、尺寸要求、文件大小、第一张图规则和模型支持。
- `skills/image-generation/references/cli.md`
  - 写了“mask/markup 应用于第一张输入图片”，但没有制作步骤。
- `skills/image-generation/references/image-api.md`
  - 有 JSON 结构，但没有说明 mask 的透明区域语义、markup 的透明画布和“不要压平”。

### 实现

- `src/input/data-url.ts` 只检查 PNG 魔数，没有检查 alpha 通道、像素尺寸或 mask 的 4MB 限制。
- `src/commands/edit.ts` 已实现 `mask`/`markup` 互斥和第一张图的发送顺序，但没有模型能力提示。
- 当前总输入限制是 64MB，不能替代 mask 的 4MB 和 markup 的 50MB 专用限制。

## 实施建议

### 文档

在 `skills/image-generation/SKILL.md` 的编辑章节增加一个简短小节，至少包含：

- 两者都只作用于第一张图。
- mask：透明区域表示要编辑的区域；PNG、alpha、同尺寸、4MB。
- markup：单独透明 PNG 标注层，不压平到原图；同尺寸、保留透明像素、50MB；支持 2.5/2.6。
- 两者互斥。
- 提示词要说明修改内容和需要保留的细节。

在 `references/image-api.md` 保留完整规则和 JSON 示例。JSON 示例应体现：

```json
{
  "images": [
    { "image_url": "data:image/png;base64,..." }
  ],
  "mask": {
    "image_url": "data:image/png;base64,..."
  }
}
```

markup 示例只把 `mask` 换成 `markup`，并明确不能同时出现。

### 可选校验

以下校验能提前发现错误，但不是本次文档修复的前置条件：

- mask 本地文件不超过 4MB。
- markup 本地文件不超过 50MB。
- PNG 包含 alpha 通道或 `tRNS`。
- mask/markup 的宽高与第一张图一致。
- 使用 markup 且模型不属于 2.5/2.6 时给出 warning。

尺寸校验需要解析 PNG/JPEG/WebP 头部。实现时应把“API 要求”和“CLI 提前校验”分开，避免把 API 的最终判断完全复制到客户端。

## 验收

- skill 能直接说明 mask 和 markup 的制作步骤、透明区域含义、尺寸/格式/大小限制。
- skill 明确两者都只作用于第一张输入图，且不能同时使用。
- skill 明确 markup 支持 2.5/2.6，并说明标注层不能压平到原图。
- `--mask` 和 `--markup` 的帮助文本至少提到 PNG、第一张图、互斥。
- 如果实现可选校验，错误在调用 API 前以退出码 2 返回。

## 参考

- <https://developers.openai.com/api/reference/resources/images/methods/edit>
- <https://developers.openai.com/api/docs/guides/image-prompting>
