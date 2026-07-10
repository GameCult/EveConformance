import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchemaSubset } from "../lib/schema-subset.mjs";

const [witnessArgument, exportArgument] = process.argv.slice(2);
if (!witnessArgument || !exportArgument) {
  console.error("Usage: node tools/conformance/attach-runtime-witness.mjs <runtime-witness.json> <conformance-export-directory>");
  process.exit(2);
}

const witnessPath = path.resolve(witnessArgument);
const exportDirectory = path.resolve(exportArgument);
const indexPath = path.join(exportDirectory, "index.json");
const witness = parseJson(await readFile(witnessPath, "utf8"));
validateWitness(witness);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const kernelRoot = path.resolve(process.env.EVE_KERNEL_ROOT || "E:\\Projects\\Eve");
const witnessSchema = parseJson(await readFile(path.join(kernelRoot, "schemas/gamecult.eve.runtime_witness.v1.schema.json"), "utf8"));
const schemaErrors = validateSchemaSubset(witnessSchema, witness);
if (schemaErrors.length) throw new Error(`Runtime witness schema errors: ${schemaErrors.join("; ")}`);

const attachmentRoot = path.join(exportDirectory, "attachments", "runtime", safeSegment(witness.witnessId));
await mkdir(attachmentRoot, { recursive: true });
const artifacts = [];
for (const artifact of witness.artifacts) {
  const sourcePath = path.resolve(path.dirname(witnessPath), artifact.path);
  const fileName = path.basename(sourcePath);
  const destinationPath = path.join(attachmentRoot, fileName);
  await copyFile(sourcePath, destinationPath);
  artifacts.push({
    ...artifact,
    exportPath: slash(path.relative(exportDirectory, destinationPath)),
  });
}

const exportedWitness = { ...witness, artifacts };
const exportedWitnessPath = path.join(attachmentRoot, "witness.json");
await writeFile(exportedWitnessPath, `${JSON.stringify(exportedWitness, null, 2)}\n`);

const index = parseJson(await readFile(indexPath, "utf8"));
const record = {
  witnessId: witness.witnessId,
  runtimeId: witness.runtimeId,
  runtimeOwnerRepo: witness.runtimeOwnerRepo,
  providerId: witness.providerId,
  surfaceId: witness.surfaceId,
  projectionKind: witness.projectionKind,
  status: witness.status,
  cacheState: witness.execution.cacheState,
  witnessExportPath: slash(path.relative(exportDirectory, exportedWitnessPath)),
  artifactCount: artifacts.length,
};
index.runtimeWitnesses = [
  ...(Array.isArray(index.runtimeWitnesses) ? index.runtimeWitnesses : []).filter(candidate => candidate.witnessId !== record.witnessId),
  record,
].sort((left, right) => left.witnessId.localeCompare(right.witnessId));
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(exportedWitnessPath);

function validateWitness(value) {
  for (const field of ["witnessId", "runtimeId", "runtimeOwnerRepo", "providerId", "surfaceId", "projectionKind", "status", "generatedAtUtc", "authority"]) {
    if (!value?.[field]) throw new Error(`Runtime witness missing ${field}.`);
  }
  if (value.schema !== "gamecult.eve.runtime_witness.v1") throw new Error(`Unexpected runtime witness schema: ${value.schema || ""}`);
  if (!value.execution?.cacheState || !Number.isFinite(value.execution?.durationMs)) throw new Error("Runtime witness execution is incomplete.");
  if (!value.assertions || typeof value.assertions !== "object") throw new Error("Runtime witness assertions are missing.");
  if (value.receipts !== undefined && !Array.isArray(value.receipts)) throw new Error("Runtime witness receipts must be an array when present.");
  if (!Array.isArray(value.artifacts) || !value.artifacts.length) throw new Error("Runtime witness artifacts are missing.");
  for (const artifact of value.artifacts) {
    if (!artifact.path || !/^[a-f0-9]{64}$/i.test(artifact.sha256 || "") || !(artifact.sizeBytes > 0)) {
      throw new Error(`Runtime witness artifact is invalid: ${artifact.path || "unknown"}`);
    }
  }
}

function safeSegment(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-"); }
function slash(value) { return value.replaceAll("\\", "/"); }
function parseJson(value) { return JSON.parse(value.replace(/^\uFEFF/, "")); }
