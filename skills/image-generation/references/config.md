# 配置

## 位置

默认配置目录：

```text
~/.image-generation-cli/
├── config.json
├── .env
└── .env.example
```

Windows 下 `~` 为 `%USERPROFILE%`。

覆盖规则：

- `IMAGE_GENERATION_HOME`：覆盖配置目录
- `--config <path>`：覆盖配置文件
- `.env` 从配置文件所在目录加载
- 进程环境变量优先于 `.env`

## 示例

示例中的模型名按实际 provider 替换。未设置的输出参数由 API 使用自身默认值。

```json
{
  "defaultProvider": "openai",
  "providers": {
    "openai": {
      "apiUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "defaultModel": "gpt-image-2.6-flare",
      "models": {
        "gpt-image-2.6-flare": {},
        "gpt-image-2.6-sunburst": {}
      }
    }
  }
}
```

`models` 下的空对象表示不为该模型覆盖默认值。

`.env.example`：

```dotenv
OPENAI_API_KEY=
```

## 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `defaultProvider` | 是 | 默认 provider，必须存在于 `providers` |
| `defaults` | 否 | 全局输出默认值 |
| `providers` | 是 | provider 映射 |
| `provider.apiUrl` | 是 | API 基址，如 `https://api.openai.com/v1` |
| `provider.apiKey` | 是 | 密钥或 `${ENV_VAR}` 占位符 |
| `provider.defaultModel` | 是 | 默认模型，必须存在于 `models` |
| `provider.defaults` | 否 | provider 级输出默认值 |
| `provider.models` | 是 | 模型映射，至少一个 |
| `model.defaults` | 否 | model 级输出默认值 |

未知字段会被拒绝。

## 输出默认值

| 字段 | 取值 | API 默认 | 说明 |
| --- | --- | --- | --- |
| `n` | 1 至 10 | 1 | 生成张数 |
| `size` | `auto` 或 `WIDTHxHEIGHT` | `auto` | 合法区间见 `cli.md` 的 `size` |
| `quality` | `low` `medium` `high` `xhigh` `max` `auto` | `auto` | `xhigh`/`max` 需要模型支持 |
| `background` | `transparent` `opaque` `auto` | `auto` | `transparent` 仅 png/webp |
| `output_format` | `png` `webp` `jpeg` | `png` | 输出格式 |
| `output_compression` | 0 至 100 整数 | 100 | 仅 jpeg/webp |
| `response_format` | `url` `b64_json` | 省略 | 兼容中转；OpenAI 已废弃，默认不发送 |
| `moderation` | `auto` `low` | `auto` | |
| `complexity` | `low` `medium` `high` | 模型默认 | 省略时不发送，由模型决定 |

## 合并

```mermaid
flowchart LR
  G["全局 defaults"] --> P["provider.defaults"]
  P --> M["model.defaults"]
  M --> C["CLI 参数"]
  C --> E["生效参数"]
```

- 按字段覆盖。
- `null` 删除上层继承的键，不发送给 API。
- 合并后做跨字段校验。
- 未设置的字段不写入请求体，由 API 使用自身默认值。

示例：

```json
{
  "defaults": {
    "quality": "medium",
    "output_format": "png"
  },
  "providers": {
    "proxy": {
      "defaults": {
        "quality": "high",
        "output_format": null
      }
    }
  }
}
```

`proxy` 的生效值包含 `quality: high`，不包含 `output_format`。

## 密钥

`apiKey` 支持两种形式：

```json
"apiKey": "sk-..."
```

```json
"apiKey": "${OPENAI_API_KEY}"
```

占位符必须覆盖整个值。解析时从进程环境变量读取；CLI 会在需要调用 API 时加载配置文件同级的 `.env`。

`.env` 示例：

```dotenv
OPENAI_API_KEY=sk-...
```

进程环境变量优先。例如 shell 中已有 `OPENAI_API_KEY` 时，`.env` 不会覆盖它。

## 脱敏

`image-generation config` 输出脱敏后的完整配置：

```json
{
  "configPath": "C:\\Users\\Admin\\.image-generation-cli\\config.json",
  "config": {
    "defaultProvider": "openai",
    "providers": {
      "openai": {
        "apiUrl": "https://api.openai.com/v1",
        "apiKey": "[REDACTED]"
      }
    }
  }
}
```

`config --effective` 输出合并后的默认值和来源：

```json
{
  "configPath": "C:\\Users\\Admin\\.image-generation-cli\\config.json",
  "provider": "openai",
  "model": "gpt-image-2.6-flare",
  "defaults": {
    "n": 1,
    "size": "1536x1024",
    "quality": "high",
    "output_format": "png"
  },
  "sources": {
    "n": "global",
    "size": "model",
    "quality": "provider",
    "output_format": "global"
  }
}
```

来源取值：`global`、`provider`、`model`。generate/edit 的 CLI 参数在内部作为 `cli` 来源参与合并。

## 初始化与检查

```bash
image-generation init
```

创建配置目录、`config.json` 和 `.env.example`。已存在的文件不覆盖。

```bash
image-generation doctor
```

检查 Node.js 版本、CLI 版本、配置文件、默认 provider/model、密钥引用、输出目录和打包内 skill 路径。不调用图片 API。

## 配置命令

```bash
image-generation config
image-generation config --effective
image-generation config --effective --provider openai --model gpt-image-2.6-flare
```

`--provider` 和 `--model` 仅与 `--effective` 一起使用。
