import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const kernelRoot = path.resolve(process.env.EVE_KERNEL_ROOT || "E:\\Projects\\Eve");
const { compileEveDsl } = await import(pathToFileURL(path.join(kernelRoot, "web/eve-dsl.js")));
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

const surface = await loadSurface(fixture, fixture.surface);
surface.fixtureId = fixture.id;
surface.values ||= surface.mesh?.snapshot?.() || {};
delete surface.mesh;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(surface, null, 2)}\n`);
console.log(outputPath);

async function loadSurface(owner, surface) {
  const absolutePath = path.resolve(repoRoot, owner.sourceRoot || ".", surface.path);
  const source = await readFile(absolutePath, "utf8");
  if (surface.transport === "local-eve-dsl") return compileEveDsl(source);
  if (surface.transport === "local-json") return JSON.parse(source);
  throw new Error(`Unsupported parity surface transport: ${surface.transport}`);
}
