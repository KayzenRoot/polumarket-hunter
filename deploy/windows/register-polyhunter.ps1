[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$InstallDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,

    [Parameter(Mandatory = $false)]
    [string]$TaskName = 'PolyHunter',

    [Parameter(Mandatory = $false)]
    [string]$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
$runScript = Join-Path $PSScriptRoot 'run-polyhunter.ps1'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runScript`" -InstallDir `"$InstallDir`" -NodeExe `"$NodeExe`""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'PolyHunter paper-first prediction market terminal' `
    -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' for $InstallDir"
Write-Host "Start it now with: Start-ScheduledTask -TaskName '$TaskName'"
