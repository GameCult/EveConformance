import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = path.resolve(process.argv[2] || process.env.EVE_WORKSPACE_ROOT || path.dirname(repoRoot));
const lock = JSON.parse(await readFile(path.join(repoRoot, "conformance-workspace.lock.json"), "utf8"));

if (lock.schema !== "gamecult.eve.conformance_workspace_lock.v1") {
  throw new Error(`Unexpected workspace lock schema: ${lock.schema || "missing"}`);
}

for (const repository of lock.repositories) {
  if (!repository.name || !/^https:\/\/github\.com\/GameCult\/.+\.git$/.test(repository.url || "")) {
    throw new Error(`Invalid repository coordinate: ${repository.name || "unnamed"}`);
  }
  if (!/^[a-f0-9]{40}$/.test(repository.commit || "")) {
    throw new Error(`Invalid commit for ${repository.name}`);
  }
  const checkout = path.join(workspaceRoot, repository.name);
  const actual = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actual !== repository.commit) {
    throw new Error(`${repository.name} is ${actual}; lock requires ${repository.commit}`);
  }
}

console.log(`Verified ${lock.repositories.length} locked repositories in ${workspaceRoot}`);
