export type ErrorKind =
  | "usage"
  | "config"
  | "auth"
  | "api"
  | "network"
  | "io"
  | "retry"
  | "internal";

export interface ModerationInfo {
  stage?: string;
  categories?: string[];
}

export interface AppErrorOptions {
  kind: ErrorKind;
  message: string;
  exitCode: number;
  status?: number;
  type?: string;
  code?: string;
  requestId?: string;
  moderation?: ModerationInfo;
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly exitCode: number;
  readonly status?: number;
  readonly type?: string;
  readonly code?: string;
  readonly requestId?: string;
  readonly moderation?: ModerationInfo;

  constructor(options: AppErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "AppError";
    this.kind = options.kind;
    this.exitCode = options.exitCode;
    this.status = options.status;
    this.type = options.type;
    this.code = options.code;
    this.requestId = options.requestId;
    this.moderation = options.moderation;
  }

  toJSON(): { ok: false; error: Record<string, unknown> } {
    const error: Record<string, unknown> = {
      kind: this.kind,
      message: this.message,
    };

    if (this.status !== undefined) error.status = this.status;
    if (this.type !== undefined) error.type = this.type;
    if (this.code !== undefined) error.code = this.code;
    if (this.requestId !== undefined) error.requestId = this.requestId;
    if (this.moderation !== undefined) error.moderation = this.moderation;

    return { ok: false, error };
  }
}

export function usageError(message: string): AppError {
  return new AppError({ kind: "usage", message, exitCode: 2 });
}

export function configError(message: string, cause?: unknown): AppError {
  return new AppError({ kind: "config", message, exitCode: 2, cause });
}

export function ioError(
  message: string,
  exitCode = 6,
  cause?: unknown,
): AppError {
  return new AppError({ kind: "io", message, exitCode, cause });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
