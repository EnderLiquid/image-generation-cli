# 移除 input_fidelity 参数

- 状态：已完成
- 日期：2026-11-17
- 范围：`edit` 命令、API 请求体、测试、skill 与 README

## 背景

`input_fidelity` 容易和输出画质混淆。它控制编辑时模型在多大程度上保留输入图像的风格和特征，尤其是人脸特征；输出画质由 `quality` 控制。

需要确认 `gpt-image-2.5`、`gpt-image-2.6` 是否可以传该参数，并决定 CLI 是否继续暴露它。

## 官方文档

### Images Edit API 参考

字段定义：

> `input_fidelity: optional "high" or "low" or null`
>
> Control how much effort the model will exert to match the style and features, especially facial features, of input images. Supports `high` and `low` on `gpt-image-1.5`; `gpt-image-1-mini` supports only `low`. For `gpt-image-2`, omit this parameter. Defaults to `low` on supported models.

来源：<https://developers.openai.com/api/reference/resources/images/methods/edit>

### Image prompting 指南

指南在 `gpt-image-2` 的说明中要求省略：

> For `gpt-image-2`, omit `input_fidelity`; image inputs are always processed at high fidelity.

指南在 GPT-Image-2.6 的编辑说明中要求省略：

> Omit `input_fidelity` on image edits.

同一页的 GPT-Image-2 参数表将 `input_fidelity` 标为：

> Omit it. Image inputs are always processed at high fidelity.

来源：<https://developers.openai.com/api/docs/guides/image-prompting>

### 结论依据

- API 参考明确列出 `gpt-image-1.5` 支持 `high`/`low`，`gpt-image-1-mini` 只支持 `low`。
- API 参考明确要求 `gpt-image-2` 省略。
- 指南明确要求 GPT-Image-2.6 编辑时省略。
- API 参考没有把 `gpt-image-2.5` 列入支持范围。
- 没有找到官方文档支持 `gpt-image-2.5` 传该参数。

因此，对当前目标模型 `gpt-image-2.5`、`gpt-image-2.6`，应统一省略 `input_fidelity`。

## 决策

- CLI 不再提供 `--input-fidelity`。
- 请求体不发送 `input_fidelity`，不为任何模型保留特殊分支。
- 需要保留人物、风格或特定特征时，在编辑提示词中明确写出要保留的内容。
- 需要调整输出画质时，使用 `quality`。
- 如确实需要旧模型的 `input_fidelity` 行为，直接调用 API，不由本 CLI 承担兼容承诺。

## 实施

1. `src/cli.ts`
   - 删除 `--input-fidelity` 选项。
   - 删除 `parseInputFidelity`。
2. `src/commands/edit.ts`
   - 删除 `inputFidelity` 选项字段。
   - 删除 `request.input_fidelity` 赋值。
   - 删除 `prepareRequest` 中对 `gpt-image-2` 的删除和 warning。
   - 删除不再使用的 `isGptImage2Model`。
3. `src/api/types.ts`
   - 从 `ImageEditRequest` 删除 `input_fidelity`。
4. `src/commands/common.ts`
   - 删除 `requestSummary.input_fidelity` 记录。
5. 测试
   - 删除“为 gpt-image-2 省略 input_fidelity”用例。
6. 文档
   - 删除 `skills/image-generation/SKILL.md` 中的 `--input-fidelity` 说明。
   - 删除 `skills/image-generation/references/cli.md` 的 input_fidelity 小节。
   - 删除 `skills/image-generation/references/image-api.md` 的 input_fidelity 请求示例。
   - 检查 README、AGENTS.md 和旧任务文档，避免继续把该参数描述为现能力。

## 验收

- `image-generation edit --help` 不显示 `--input-fidelity`。
- `image-generation edit --input-fidelity high ...` 以参数错误退出，退出码 2。
- dry-run 和实际请求体都不包含 `input_fidelity`。
- `npm run typecheck`、`npm test` 通过。
- skill 文档不再出现 `input_fidelity` 作为可用参数。

## 参考

- <https://developers.openai.com/api/reference/resources/images/methods/edit>
- <https://developers.openai.com/api/docs/guides/image-prompting>
