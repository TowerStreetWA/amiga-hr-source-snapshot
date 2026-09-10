import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, "..", "api-zod", "src", "index.ts");

// Orval's auto-generated barrel double-exports zod constants and TypeScript
// interfaces under the same names; keep only the zod constants from api.ts.
writeFileSync(indexPath, `export * from "./generated/api";\n`);
console.log("Rewrote", indexPath);
