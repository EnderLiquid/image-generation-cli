# 移除本地输入 64MB 聚合限制

- 状态：已实施
- 日期：2026-11-17
- 范围：`src/input/data-url.ts`、`src/commands/edit.ts`、测试、skill 文档、旧任务文档

## 背景

`src/input/data-url.ts` 定义了：

```ts
export const MAX_TOTAL_INPUT_BYTES = 64 * 1024 * 1024;
```

`edit` 命令在读取本地图片时累加原始字节，超过该值就以参数错误退出。需要确认这个数字是否来自 OpenAI API 的硬性限制。

## 官方限制

Images Edit API 的 JSON 请求只规定每个 `image_url` 的长度：

- `images[].image_url`
- `mask.image_url`
- `markup.image_url`

三者上限一致，都是 `20,971,520` 字符。本地图片转为 base64 data URL 后，单图原始大小约为 15MB。

multipart 请求规定每张图片小于 50MB，最多 16 张。该模式不是当前 CLI 使用的协议。

官方 Image API edits 文档没有规定本地输入原始字节合计上限，也没有 64MB 这个数字。

vision 指南中的 512MB total payload 是图像理解请求的限制，不适用于 Image API edits，不能作为 64MB 的依据。

## 问题

- `64 * 1024 * 1024` 是 64 MiB（67,108,864 字节），文档里写成 64MB，数字本身也不是官方值。
- 该限制只统计本地文件的原始字节。HTTPS URL 不计入，base64 后的请求体也不计入，因此它不是请求体大小限制。
- 5 张接近 15MB 的本地图片就会超过 64MiB，被 CLI 拒绝；按官方单图上限，它们可以分别通过。
- `skills/image-generation/references/image-api.md` 和旧任务文档把这个值描述成协议约束，属于错误归因。

## 决策

- 删除 `MAX_TOTAL_INPUT_BYTES`。
- 删除 `assertTotalInputBytes` 及 `edit` 命令中的累计逻辑。
- 保留单图限制：
  - 本地文件解码后不超过 `MAX_LOCAL_BYTES`。
  - 生成的 data URL 不超过 `MAX_IMAGE_URL_CHARS`。
- 不增加新的聚合上限。CLI 不再提供官方文档之外的本地输入总量限制。

移除聚合限制后，16 张接近上限的本地图片会占用较多内存。这是用户主动提交大输入时的正常成本，不用一个未文档化的 64MB 阈值替代 API 判断。

## 实施

1. `src/input/data-url.ts`
   - 删除 `MAX_TOTAL_INPUT_BYTES`。
   - 删除 `assertTotalInputBytes`。
   - 保留 `MAX_IMAGE_URL_CHARS`、`MAX_LOCAL_BYTES` 和单图检查。
2. `src/commands/edit.ts`
   - 删除 `assertTotalInputBytes` 导入。
   - 删除 `totalBytes` 变量及三处累加和检查。
3. 测试
   - 删除或替换对总量限制的依赖。
   - 保留单图超限用例。
   - 增加用例：多张本地图片可以一起提交，不再因为累计字节数被拒绝。
4. 文档
   - 删除 `skills/image-generation/references/image-api.md` 中“所有本地输入原始字节合计不超过 64MB”。
   - 更新 `docs/tasks/26-11-16-image-generation-cli/design.md` 中相同表述。
   - 检查 `docs/tasks/26-11-17-mask-markup/design.md`，避免继续把 64MB 描述为当前约束。

## 验收

- `src` 和 `tests` 中不再出现 `MAX_TOTAL_INPUT_BYTES`、`assertTotalInputBytes`、`totalBytes`。
- 单张本地图片超过 data URL 上限时仍然报错。
- 多张本地图片各自在上限内时可以提交，不受累计 64MiB 限制。
- skill 文档和旧任务文档不再把 64MB 描述为 API 约束。
- `npm run typecheck`、`npm test` 通过。

## 参考

- <https://developers.openai.com/api/reference/resources/images/methods/edit>
- <https://developers.openai.com/api/docs/guides/images-vision>
