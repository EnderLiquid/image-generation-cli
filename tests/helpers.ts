import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { IncomingHttpHeaders } from "node:http";

export interface MockRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: unknown;
  rawBody: string;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface MockServer {
  baseUrl: string;
  requests: MockRequest[];
  close: () => Promise<void>;
}

export async function startMockServer(
  handler: (
    request: MockRequest,
  ) => MockResponse | Promise<MockResponse>,
): Promise<MockServer> {
  const requests: MockRequest[] = [];

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(
        typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.from(chunk),
      );
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    let body: unknown;

    try {
      body = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      body = rawBody;
    }

    const mockRequest: MockRequest = {
      method: request.method ?? "",
      url: request.url ?? "",
      headers: request.headers,
      body,
      rawBody,
    };

    requests.push(mockRequest);

    const mockResponse = await handler(mockRequest);

    response.statusCode = mockResponse.status ?? 200;

    for (const [name, value] of Object.entries(
      mockResponse.headers ?? {},
    )) {
      response.setHeader(name, value);
    }

    if (mockResponse.body === undefined) {
      response.end();
      return;
    }

    if (typeof mockResponse.body === "string") {
      response.end(mockResponse.body);
      return;
    }

    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(mockResponse.body));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export async function makeTempDir(): Promise<string> {
  const root = path.resolve(".pi/temp");
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, "image-generation-cli-test-"));
}

export interface TestConfigOptions {
  apiUrl: string;
  apiKey?: string;
  model?: string;
  models?: string[];
  providerDefaults?: Record<string, unknown>;
  modelDefaults?: Record<string, unknown>;
  globalDefaults?: Record<string, unknown>;
}

export async function writeTestConfig(
  dir: string,
  options: TestConfigOptions,
): Promise<string> {
  const model = options.model ?? "test-model";
  const modelNames = options.models ?? [model];
  const models = Object.fromEntries(
    modelNames.map((name) => [
      name,
      name === model && options.modelDefaults
        ? { defaults: options.modelDefaults }
        : {},
    ]),
  );

  const config = {
    defaultProvider: "test",
    defaults: options.globalDefaults ?? {
      output_format: "png",
    },
    providers: {
      test: {
        apiUrl: options.apiUrl,
        apiKey: options.apiKey ?? "test-key",
        defaultModel: model,
        ...(options.providerDefaults
          ? { defaults: options.providerDefaults }
          : {}),
        models,
      },
    },
  };

  const configPath = path.join(dir, "config.json");
  await writeFile(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  return configPath;
}

export function makePngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
}

export function makeJpegBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01,
  ]);
}

export function makeWebpBuffer(): Buffer {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, Buffer.from([0x56, 0x50, 0x38, 0x20])]);
}

export function makeApiResponse(buffers: Buffer[]): {
  created: number;
  data: Array<{ b64_json: string }>;
  usage: Record<string, number>;
} {
  return {
    created: 1_763_223_555,
    data: buffers.map((buffer) => ({
      b64_json: buffer.toString("base64"),
    })),
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
    },
  };
}

export function randomName(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}
