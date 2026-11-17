# 移除成功时的 saved: stderr 输出

- 状态：已实施
- 日期：2026-11-17
- 范围：CLI 成功输出行为、测试、README 和 skill 文档

## 背景

`generate` 和 `edit` 成功时，stdout 输出结果 JSON，stderr 还会逐个文件输出：

```text
saved: D:\work\generated\image-20261116-202555-3f9a.png
```

路径已经包含在 stdout JSON 的 `files[].path` 中。非交互调用通常会把 stderr 非空视为警告或异常，这行会造成误判，并增加日志噪声。

## 需求

成功时 stderr 保持为空。stdout JSON 结构和退出码不变。失败时仍在 stderr 输出错误 JSON。

## 验收

- `generate` 和 `edit` 成功时 stderr 为空。
- `--dry-run` 不输出 `saved:`。
- 失败路径的 stderr JSON、退出码和重试行为不变。
- 测试不再断言 `saved:`，改为断言 stderr 为空。
- README 和 skill 的 CLI 文档删除 `saved:` 示例和说明。

## 影响

- `src/output/result.ts`：移除 `writeSavedPath`。
- `src/cli.ts`：`printResult` 不再逐个输出保存路径。
- `tests/cli.test.ts`：更新成功输出断言。
- `README.md`、`skills/image-generation/references/cli.md`：删除相关描述。

## 不做

- 不新增 `--verbose`、TTY 分支或替代的人工进度输出。
