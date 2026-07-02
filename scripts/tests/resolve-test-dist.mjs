import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, ".test-dist");

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {}",
      format: "module",
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2).replace(/\.js$/, "");
    const jsPath = join(DIST, "src", `${sub}.js`);
    if (existsSync(jsPath)) {
      return { url: pathToFileURL(jsPath).href, format: "module", shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
