import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {}",
      format: "module",
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2);
    const withExt = sub.endsWith(".ts") || sub.endsWith(".tsx") ? sub : `${sub}.ts`;
    return {
      url: pathToFileURL(join(SRC, withExt)).href,
      format: "module",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
