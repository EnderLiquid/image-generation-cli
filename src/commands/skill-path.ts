import { existsSync } from "node:fs";
import { ioError } from "../errors.js";
import { getSkillPath } from "../paths.js";

export function skillPathCommand(): string {
  const skillPath = getSkillPath();

  if (!existsSync(skillPath)) {
    throw ioError(`skill 目录不存在: ${skillPath}`);
  }

  return skillPath;
}
