import { describe, expect, it } from "vitest";
import {
  buildEndpointUrl,
  callImageApi,
  decodeImageOutputs,
} from "../src/api/client.js";
import { AppError } from "../src/errors.js";
import {
  makeApiResponse,
  makePngBuffer,
  startMockServer,
} from "./helpers.js";

describe("API 客户端", () => {
  it("拼接端点 URL", () => {
    expect(
      buildEndpointUrl(
        "https://api.openai.com/v1/",
        "generate",
      ),
    ).toBe("https://api.openai.com/v1/images/generations");

    expect(
      buildEndpointUrl(
        "https://api.openai.com/v1",
        "edit",
      ),
    ).toBe("https://api.openai.com/v1/images/edits");
  });

  it("发送 JSON 请求并解析 b64_json", async () => {
    const image = makePngBuffer();
    const server = await startMockServer(() => ({
      body: makeApiResponse([image]),
      headers: {
        "x-request-id": "req_success",
      },
    }));

    try {
      const result = await callImageApi({
        url: `${server.baseUrl}/v1/images/generations`,
        apiKey: "test-key",
        body: {
          model: "test-model",
          prompt: "test",
        },
        timeoutSeconds: 5,
        retries: 0,
      });

      expect(result.requestId).toBe("req_success");
      expect(result.attempts).toBe(1);
      expect(
        server.requests[0]?.headers.authorization,
      ).toBe("Bearer test-key");
      expect(
        server.requests[0]?.headers["content-type"],
      ).toBe("application/json");
      expect(server.requests[0]?.body).toEqual({
        model: "test-model",
        prompt: "test",
      });
      expect(decodeImageOutputs(result.response)[0]).toEqual({
        kind: "image",
        data: image,
      });
    } finally {
      await server.close();
    }
  });

  it("映射 401 为认证错误", async () => {
    const server = await startMockServer(() => ({
      status: 401,
      body: {
        error: {
          message: "invalid api key",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      },
      headers: {
        "x-request-id": "req_auth",
      },
    }));

    try {
      await expect(
        callImageApi({
          url: `${server.baseUrl}/v1/images/generations`,
          apiKey: "bad-key",
          body: {},
          timeoutSeconds: 5,
          retries: 0,
        }),
      ).rejects.toMatchObject({
        kind: "auth",
        exitCode: 3,
        status: 401,
        code: "invalid_api_key",
        requestId: "req_auth",
      });
    } finally {
      await server.close();
    }
  });

  it("映射 moderation 错误", async () => {
    const server = await startMockServer(() => ({
      status: 400,
      body: {
        error: {
          message: "blocked",
          type: "image_generation_user_error",
          code: "moderation_blocked",
          moderation_details: {
            moderation_stage: "input",
            categories: ["harassment"],
          },
        },
      },
    }));

    try {
      await expect(
        callImageApi({
          url: `${server.baseUrl}/v1/images/generations`,
          apiKey: "test-key",
          body: {},
          timeoutSeconds: 5,
          retries: 0,
        }),
      ).rejects.toMatchObject({
        kind: "api",
        exitCode: 4,
        moderation: {
          stage: "input",
          categories: ["harassment"],
        },
      });
    } finally {
      await server.close();
    }
  });

  it("默认不重试", async () => {
    let calls = 0;
    const server = await startMockServer(() => {
      calls += 1;
      return {
        status: 500,
        body: {
          error: { message: "server error" },
        },
      };
    });

    try {
      await expect(
        callImageApi({
          url: `${server.baseUrl}/v1/images/generations`,
          apiKey: "test-key",
          body: {},
          timeoutSeconds: 5,
          retries: 0,
        }),
      ).rejects.toBeInstanceOf(AppError);

      expect(calls).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("显式启用重试后按 Retry-After 重试", async () => {
    let calls = 0;
    const retries: number[] = [];
    const image = makePngBuffer();
    const server = await startMockServer(() => {
      calls += 1;

      if (calls === 1) {
        return {
          status: 500,
          body: { error: { message: "server error" } },
          headers: { "retry-after": "0" },
        };
      }

      return {
        body: makeApiResponse([image]),
      };
    });

    try {
      const result = await callImageApi({
        url: `${server.baseUrl}/v1/images/generations`,
        apiKey: "test-key",
        body: {},
        timeoutSeconds: 5,
        retries: 1,
        onRetry: (info) => retries.push(info.attempt),
      });

      expect(calls).toBe(2);
      expect(result.attempts).toBe(2);
      expect(retries).toEqual([1]);
    } finally {
      await server.close();
    }
  });

  it("重试耗尽时返回退出码 7", async () => {
    let calls = 0;
    const server = await startMockServer(() => {
      calls += 1;
      return {
        status: 500,
        body: { error: { message: "server error" } },
        headers: { "retry-after": "0" },
      };
    });

    try {
      await expect(
        callImageApi({
          url: `${server.baseUrl}/v1/images/generations`,
          apiKey: "test-key",
          body: {},
          timeoutSeconds: 5,
          retries: 1,
        }),
      ).rejects.toMatchObject({
        kind: "retry",
        exitCode: 7,
      });

      expect(calls).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("接受 url 响应", () => {
    expect(
      decodeImageOutputs({
        data: [{ url: "https://example.com/image.png" }],
      }),
    ).toEqual([
      {
        kind: "url",
        url: "https://example.com/image.png",
      },
    ]);
  });

  it("同时包含 b64_json 和 url 时优先 b64_json", () => {
    const image = makePngBuffer();

    expect(
      decodeImageOutputs({
        data: [
          {
            b64_json: image.toString("base64"),
            url: "https://example.com/image.png",
          },
        ],
      }),
    ).toEqual([{ kind: "image", data: image }]);
  });

  it("拒绝既没有 b64_json 也没有 url 的响应", () => {
    expect(() =>
      decodeImageOutputs({ data: [{}] }),
    ).toThrow(/b64_json 或 url/);
  });

  it("拒绝非 http(s) 的图片 url", () => {
    expect(() =>
      decodeImageOutputs({
        data: [{ url: "file:///tmp/image.png" }],
      }),
    ).toThrow(/http\(s\)/);
  });

  it("拒绝无效的图片 url", () => {
    expect(() =>
      decodeImageOutputs({ data: [{ url: "http://[" }] }),
    ).toThrow(/url 无效/);
  });
});
