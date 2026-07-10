param(
  [string] $OutputDirectory = "artifacts\release",
  [string] $Version = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$versionName = if ($Version) { $Version } else { (git -C $repoRoot rev-parse --short=12 HEAD) }
$outputRoot = if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $repoRoot $OutputDirectory }
$stage = Join-Path $outputRoot "eve-conformance-$versionName"
$archive = "$stage.zip"

if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "conformance-workspace.lock.json") -Destination $stage
Copy-Item -LiteralPath (Join-Path $repoRoot "artifacts\parity\latest.json") -Destination (Join-Path $stage "parity-report.json")
Copy-Item -LiteralPath (Join-Path $repoRoot "artifacts\parity\latest.md") -Destination (Join-Path $stage "parity-report.md")
Copy-Item -LiteralPath (Join-Path $repoRoot "artifacts\conformance\latest") -Destination (Join-Path $stage "conformance") -Recurse
Compress-Archive -LiteralPath $stage -DestinationPath $archive
Write-Output $archive
