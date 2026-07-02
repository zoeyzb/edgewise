#!/usr/bin/env node

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const dist = join(dir, "..", "..", ".test-dist");

register(join(dir, "resolve-test-dist.mjs"), pathToFileURL("./"));
