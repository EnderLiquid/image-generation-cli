import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { IncomingHttpHeaders } from "node:http";
import sharp from "sharp";

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

export interface PngOptions {
  width?: number;
  height?: number;
  alpha?: boolean;
  palette?: boolean;
}

async function createPngBuffer(
  options: PngOptions = {},
): Promise<Buffer> {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const alpha = options.alpha ?? true;
  const background = alpha
    ? { r: 255, g: 0, b: 0, alpha: 0 }
    : { r: 255, g: 0, b: 0 };
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background,
    },
  });

  return options.palette
    ? image.png({ palette: true, colours: 16 }).toBuffer()
    : image.png().toBuffer();
}

export interface JpegOptions {
  width?: number;
  height?: number;
  orientation?: number;
}

async function createJpegBuffer(
  options: JpegOptions = {},
): Promise<Buffer> {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  let image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  });

  if (options.orientation !== undefined) {
    image = image.withMetadata({ orientation: options.orientation });
  }

  return image.jpeg().toBuffer();
}

export interface WebpOptions {
  width?: number;
  height?: number;
  alpha?: boolean;
  orientation?: number;
  lossless?: boolean;
}

async function createWebpBuffer(
  options: WebpOptions = {},
): Promise<Buffer> {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const alpha = options.alpha ?? true;
  const background = alpha
    ? { r: 0, g: 0, b: 255, alpha: 0 }
    : { r: 0, g: 0, b: 255 };
  let image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background,
    },
  });

  if (options.orientation !== undefined) {
    image = image.withMetadata({ orientation: options.orientation });
  }

  return image.webp({ lossless: options.lossless ?? false }).toBuffer();
}

const defaultPng = await createPngBuffer();
const defaultJpeg = await createJpegBuffer();
const defaultWebp = await createWebpBuffer();

export function makePngBuffer(): Buffer;
export function makePngBuffer(options: PngOptions): Promise<Buffer>;
export function makePngBuffer(
  options?: PngOptions,
): Buffer | Promise<Buffer> {
  return options === undefined
    ? defaultPng
    : createPngBuffer(options);
}

export function makeJpegBuffer(): Buffer;
export function makeJpegBuffer(options: JpegOptions): Promise<Buffer>;
export function makeJpegBuffer(
  options?: JpegOptions,
): Buffer | Promise<Buffer> {
  return options === undefined
    ? defaultJpeg
    : createJpegBuffer(options);
}

export function makeWebpBuffer(): Buffer;
export function makeWebpBuffer(options: WebpOptions): Promise<Buffer>;
export function makeWebpBuffer(
  options?: WebpOptions,
): Buffer | Promise<Buffer> {
  return options === undefined
    ? defaultWebp
    : createWebpBuffer(options);
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
