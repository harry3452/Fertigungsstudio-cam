; Desktop window update for an existing Fertigungsstudio CAM installation.
; This update intentionally leaves CAM data, STEP runtime and existing files untouched.
#define AppName "Fertigungsstudio CAM Desktop-Update"
#define AppVersion "0.2.1"
[Setup]
AppId={{60405B41-6B0E-4FA0-9907-9B40C1CFB6F3}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Fertigungsstudio CAM contributors
DefaultDirName={localappdata}\Programs\Fertigungsstudio CAM
DisableDirPage=no
DefaultGroupName=Fertigungsstudio CAM
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
OutputDir=release
OutputBaseFilename=Fertigungsstudio-CAM-Desktop-Update
UninstallDisplayName={#AppName}
CloseApplications=yes
RestartApplications=no
[Files]
Source: "publish\*"; DestDir: "{app}\Desktop"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{userprograms}\Fertigungsstudio CAM"; Filename: "{app}\Desktop\Fertigungsstudio.Desktop.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Fertigungsstudio CAM"; Filename: "{app}\Desktop\Fertigungsstudio.Desktop.exe"; WorkingDir: "{app}"
[Run]
Filename: "{app}\Desktop\Fertigungsstudio.Desktop.exe"; Description: "Fertigungsstudio CAM im eigenen Fenster starten"; Flags: postinstall nowait skipifsilent
[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not FileExists(ExpandConstant('{localappdata}\Programs\Fertigungsstudio CAM\preview_server.exe')) then
    MsgBox('Bitte zuerst Fertigungsstudio CAM installieren. Falls es in einem anderen Ordner installiert ist, diesen bei der Installation des Desktop-Updates auswählen.', mbInformation, MB_OK);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    if not FileExists(ExpandConstant('{app}\preview_server.exe')) or
       not FileExists(ExpandConstant('{app}\Serve-Fertigungsstudio-UI.ps1')) then
    begin
      MsgBox('Der gewählte Ordner enthält keine vorhandene Fertigungsstudio CAM-Installation. Bitte den Installationsordner auswählen.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;
