param(
  [string] $KernelRoot = $(if ($env:EVE_KERNEL_ROOT) { $env:EVE_KERNEL_ROOT } else { "E:\Projects\Eve" }),
  [string] $OutputDirectory = "artifacts\parity"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:EVE_KERNEL_ROOT = (Resolve-Path $KernelRoot).Path
$env:EVE_PARITY_OUTPUT = if ([IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory
} else {
  Join-Path $repoRoot $OutputDirectory
}
$env:EVE_CONFORMANCE_OUTPUT = Join-Path $repoRoot "artifacts\conformance"

Push-Location $repoRoot
try {
  node .\tools\parity\run-parity.mjs
  node .\tools\conformance\consume-export.mjs .\artifacts\conformance\latest
} finally {
  Pop-Location
}
