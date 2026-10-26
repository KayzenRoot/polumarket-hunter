[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$InstallDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,

    [Parameter(Mandatory = $false)]
    [int]$RetentionDays = 14
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $InstallDir 'logs'
if (-not (Test-Path $logDir)) {
    return
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Get-ChildItem -Path $logDir -Filter 'polyhunter.log' -File | ForEach-Object {
    $archive = Join-Path $logDir "polyhunter-$stamp.log"
    Copy-Item $_.FullName $archive -Force
    try {
        $stream = [System.IO.File]::Open(
            $_.FullName,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::ReadWrite
        )
        $stream.SetLength(0)
        $stream.Dispose()
    } catch {
        Write-Warning "Could not truncate $($_.FullName): $($_.Exception.Message)"
    }
}

Get-ChildItem -Path $logDir -Filter 'polyhunter-*.log' -File |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item -Force
