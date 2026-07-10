import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileEveDsl } from "../../web/eve-dsl.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "tools/parity/parity-manifest.json"), "utf8"));

const fixtureId = process.argv[2] || "cultui-inspector";
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(repoRoot, "artifacts/parity/fixtures", `${fixtureId}.surface.json`);

const fixture = manifest.fixtures.find(candidate =>
  candidate.id === fixtureId || candidate.expect?.providerId === fixtureId);

if (!fixture) {
  throw new Error(`Unknown parity fixture: ${fixtureId}`);
}

const surface = await loadSurface(fixture.surface);
surface.fixtureId = fixture.id;
surface.values ||= surface.mesh?.snapshot?.() || {};
delete surface.mesh;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(surface, null, 2)}\n`);
console.log(outputPath);

async function loadSurface(surface) {
  const absolutePath = path.join(repoRoot, surface.path);
  const source = await readFile(absolutePath, "utf8");
  if (surface.transport === "local-eve-dsl") return compileEveDsl(source);
  if (surface.transport === "local-json") return JSON.parse(source);
  throw new Error(`Unsupported parity surface transport: ${surface.transport}`);
}
