@echo off
title Fertigungsstudio CAM - Windows Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Fertigungsstudio-Test.ps1"
if errorlevel 1 (
  echo.
  echo Start fehlgeschlagen. Bitte die Meldung oben notieren.
  pause
)
