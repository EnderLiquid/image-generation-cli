import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempRoot = path.join(os.tmpdir(), "image-generation-cli-tests");

const createdDirs: string[] = [];

export async function makeTempDir(): Promise<string> {
  await mkdir(tempRoot, { recursive: true });

  const dir = await mkdtemp(path.join(tempRoot, "test-"));
  createdDirs.push(dir);

  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  const dirs = createdDirs.splice(0);

  await Promise.all(
    dirs.map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      }),
    ),
  );
}
