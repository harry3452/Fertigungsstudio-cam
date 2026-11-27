# Windows test build, no Cargo/Rust installation required.
$ErrorActionPreference = 'Stop'
$previewProcess = $null
try {
    $exe = Join-Path -Path $PSScriptRoot -ChildPath 'preview_server.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw 'preview_server.exe fehlt. Bitte das gesamte Windows-Testpaket entpacken.'
    }
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $exe
    $startInfo.WorkingDirectory = $PSScriptRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $previewProcess = New-Object System.Diagnostics.Process
    $previewProcess.StartInfo = $startInfo
    if (-not $previewProcess.Start()) { throw 'Der lokale CAM-Vorschaudienst konnte nicht gestartet werden.' }
    $line = $previewProcess.StandardOutput.ReadLineAsync()
    if (-not $line.Wait(15000)) {
        throw 'Der lokale CAM-Vorschaudienst hat nicht innerhalb von 15 Sekunden geantwortet.'
    }
    $url = $line.Result
    if ($url -notmatch '^Fertigungsstudio local preview: (http://127\.0\.0\.1:[0-9]+/)$') {
        throw 'Keine gueltige Vorschauadresse. Falls der Port 47631 belegt ist, zuerst andere laufende Fertigungsstudio-Fenster schliessen.'
    }
    $address = $Matches[1]
    Write-Host 'Fertigungsstudio CAM - lokale Windows-Testversion'
    Write-Host "Adresse: $address"
    Start-Process $address
    Write-Host ''
    Write-Host 'Im Browser: Setup > Rohteil und Material, Werkzeugliste, Fraesen > Planfraesen.'
    Write-Host 'Werkzeugbahn berechnen. Im Bereich Sim werden G54-G59-Koordinaten angezeigt.'
    Write-Host 'Nur Entwicklungstest: kein G-Code und keine Verbindung zur Maschine.'
    Write-Host 'Dieses Fenster offen lassen. Enter beendet den lokalen Dienst.'
    [void][Console]::ReadLine()
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $previewProcess) {
        if (-not $previewProcess.HasExited) {
            $previewProcess.Kill()
            $previewProcess.WaitForExit()
        }
        $previewProcess.Dispose()
    }
}
