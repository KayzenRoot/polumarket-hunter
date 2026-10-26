[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$InstallDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,

    [Parameter(Mandatory = $false)]
    [string]$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'polyhunter.log'

Set-Location $InstallDir
& $NodeExe 'apps/server/dist/main.js' *>> $log
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
exit 0
