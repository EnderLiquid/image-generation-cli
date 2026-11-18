import { afterEach } from "vitest";
import { cleanupTempDirs } from "./temp.js";

afterEach(async () => {
  await cleanupTempDirs();
});
