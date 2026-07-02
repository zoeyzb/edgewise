import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

export function fixTestDistImports(distRoot) {
  function walk(dir, files = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, files);
      else if (full.endsWith(".js")) files.push(full);
    }
    return files;
  }

  for (const file of walk(distRoot)) {
    let content = readFileSync(file, "utf8");
    content = content.replace(/require\("@\/lib\/([^"]+)"\)/g, (_, imp) => {
      const target = join(distRoot, "src", "lib", imp);
      let rel = relative(dirname(file), target).replace(/\\/g, "/");
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return `require("${rel}")`;
    });
    content = content.replace(/require\("server-only"\)/g, 'require("node:module")');
    writeFileSync(file, content);
  }
}
