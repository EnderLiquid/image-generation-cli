import { fileURLToPath } from "node:url";

export function getPackageRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

export function getSkillPath(): string {
  return fileURLToPath(
    new URL("../skills/image-generation", import.meta.url),
  );
}

export function getExamplesPath(): string {
  return fileURLToPath(new URL("../examples", import.meta.url));
}
