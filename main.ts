// main.ts — the entry program for the Sunset Cover Studio entry.
//
// Copies app/ and screenshots/ from beside this file into the output
// directory, then writes dossier.json there with buildDossier from the
// kit's dossier library. The output directory comes from the
// MAKEFUN_OUTPUT_DIR environment variable and defaults to /output.
// The program is deterministic: the same input files always produce the
// same output bytes.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

function copyTree(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) return;
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true, dereference: false });
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
copyTree(join(here, "app"), join(outputDir, "app"));
copyTree(join(here, "screenshots"), join(outputDir, "screenshots"));

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots_max_count: 4,
  screenshot_max_bytes: 262144,
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_max_path_bytes: 1000,
});
writeFileSync(join(outputDir, "dossier.json"), dossier);
console.log(`Wrote ${outputDir}/dossier.json (${dossier.length} bytes).`);
