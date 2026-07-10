import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchemaSubset } from "../../runtimes/incubating/test-support/schema-subset.mjs";

const [witnessArgument, exportArgument] = process.argv.slice(2);
if (!witnessArgument || !exportArgument) {
  console.error("Usage: node tools/conformance/attach-plugin-witness.mjs <plugin-witness.json> <conformance-export-directory>");
  process.exit(2);
}
const witnessPath = path.resolve(witnessArgument);
const exportDirectory = path.resolve(exportArgument);
const indexPath = path.join(exportDirectory, "index.json");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const witness = parseJson(await readFile(witnessPath, "utf8"));
const schema = parseJson(await readFile(path.join(repoRoot, "schemas/gamecult.eve.plugin_witness.v1.schema.json"), "utf8"));
const schemaErrors = validateSchemaSubset(schema, witness);
if (schemaErrors.length) throw new Error(`Plugin witness schema errors: ${schemaErrors.join("; ")}`);

const attachmentRoot = path.join(exportDirectory, "attachments", "plugin", safeSegment(witness.witnessId));
await mkdir(attachmentRoot, { recursive: true });
const exportedWitnessPath = path.join(attachmentRoot, "witness.json");
await writeFile(exportedWitnessPath, `${JSON.stringify(witness, null, 2)}\n`);

const index = parseJson(await readFile(indexPath, "utf8"));
const record = {
  witnessId: witness.witnessId,
  pluginId: witness.pluginId,
  ownerRepo: witness.ownerRepo,
  status: witness.status,
  transport: witness.transport,
  operationCount: witness.operations.length,
  witnessExportPath: slash(path.relative(exportDirectory, exportedWitnessPath)),
};
index.pluginWitnesses = [
  ...(Array.isArray(index.pluginWitnesses) ? index.pluginWitnesses : []).filter(candidate => candidate.witnessId !== record.witnessId),
  record,
].sort((left, right) => left.witnessId.localeCompare(right.witnessId));
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(exportedWitnessPath);

function safeSegment(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-"); }
function slash(value) { return value.replaceAll("\\", "/"); }
function parseJson(value) { return JSON.parse(value.replace(/^\uFEFF/, "")); }
