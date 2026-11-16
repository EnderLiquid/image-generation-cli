import { readFileSync } from "node:fs";

interface PackageJson {
  version: string;
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

export const VERSION = packageJson.version;
