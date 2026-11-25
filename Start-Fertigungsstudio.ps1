# Starts our own local preview and stops that process when Enter is pressed.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$previewProcess = $null
Push-Location -LiteralPath $projectRoot
try {
    Write-Host 'Fertigungsstudio CAM - lokale Entwicklungsvorschau'
    Write-Host 'Rust wird benoetigt. Der erste Build kann etwas dauern.'
    & cargo build --locked --offline --example preview_server --target-dir (Join-Path $projectRoot 'target')
    if ($LASTEXITCODE -ne 0) { throw 'Rust-Build fehlgeschlagen. Bitte die Meldung oben pruefen.' }
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Join-Path $projectRoot 'target\debug\examples\preview_server.exe'
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $previewProcess = New-Object System.Diagnostics.Process
    $previewProcess.StartInfo = $startInfo
    if (-not $previewProcess.Start()) { throw 'Vorschau konnte nicht gestartet werden.' }
    $firstLine = $previewProcess.StandardOutput.ReadLineAsync()
    if (-not $firstLine.Wait(15000)) { throw 'Zeitlimit beim Start der lokalen Vorschau.' }
    if ($firstLine.Result -notmatch '^Fertigungsstudio local preview: (http://127\.0\.0\.1:[0-9]+/)$') {
        throw 'Der Dienst hat keine gueltige lokale Adresse gemeldet.'
    }
    $previewUrl = $Matches[1]
    Start-Process $previewUrl
    Write-Host "Vorschau: $previewUrl"
    Write-Host 'Im Browser auf Live-Planfraesen oder Berechnen klicken.'
    Write-Host 'Dieses Fenster offen lassen. Enter druecken beendet diesen Vorschaudienst.'
    [void][Console]::ReadLine()
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $previewProcess) {
        if (-not $previewProcess.HasExited) { $previewProcess.Kill(); $previewProcess.WaitForExit() }
        $previewProcess.Dispose()
    }
    Pop-Location
}
