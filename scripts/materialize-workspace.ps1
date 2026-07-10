param(
  [string] $WorkspaceRoot = "artifacts\workspace",
  [string] $LockPath = "conformance-workspace.lock.json"
)

$ErrorActionPreference = "Stop"
$env:GIT_LFS_SKIP_SMUDGE = "1"
$repoRoot = Split-Path -Parent $PSScriptRoot
$lock = Get-Content -Raw -LiteralPath (Join-Path $repoRoot $LockPath) | ConvertFrom-Json
$workspace = if ([IO.Path]::IsPathRooted($WorkspaceRoot)) { $WorkspaceRoot } else { Join-Path $repoRoot $WorkspaceRoot }
New-Item -ItemType Directory -Force -Path $workspace | Out-Null

foreach ($repository in $lock.repositories) {
  $target = Join-Path $workspace $repository.name
  if (-not (Test-Path (Join-Path $target ".git"))) {
    git clone --filter=blob:none --no-checkout $repository.url $target
  }
  git -C $target remote set-url origin $repository.url
  git -C $target fetch --depth 1 origin $repository.commit
  git -C $target checkout --detach --force $repository.commit
  $actual = git -C $target rev-parse HEAD
  if ($actual -ne $repository.commit) {
    throw "$($repository.name) resolved $actual instead of $($repository.commit)."
  }
  Write-Host "$($repository.name) $actual"
}

Write-Output (Resolve-Path $workspace).Path
