// @ts-expect-error Vitest runs in Node, while this browser app intentionally omits @types/node.
import { readFileSync } from "node:fs";

const styleFiles = [
  "tokens.css",
  "shell.css",
  "workspace.css",
  "dialogs.css",
  "intake.css",
  "components.css",
  "responsive.css",
];

export const styles = styleFiles
  .map((fileName) => readFileSync(new URL(`../../src/styles/${fileName}`, import.meta.url), "utf8"))
  .join("\n");
