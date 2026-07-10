param(
  [string] $WorkspaceRoot = $(if ($env:EVE_WORKSPACE_ROOT) { $env:EVE_WORKSPACE_ROOT } else { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }),
  [string] $OutputDirectory = "artifacts\parity"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:EVE_WORKSPACE_ROOT = (Resolve-Path $WorkspaceRoot).Path
$env:EVE_KERNEL_ROOT = Join-Path $env:EVE_WORKSPACE_ROOT "Eve"
$env:EVE_PARITY_OUTPUT = if ([IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory
} else {
  Join-Path $repoRoot $OutputDirectory
}
$env:EVE_CONFORMANCE_OUTPUT = Join-Path $repoRoot "artifacts\conformance"

Push-Location $repoRoot
try {
  node .\tools\conformance\verify-workspace-lock.mjs $env:EVE_WORKSPACE_ROOT
  node .\tools\parity\run-parity.mjs
  node .\tools\conformance\consume-export.mjs .\artifacts\conformance\latest
} finally {
  Pop-Location
}
