; 난로 설치 파일(Inno Setup 6). 코스모스와 같은 규칙을 따른다.
;   - 관리자 권한 없이 설치한다.
;   - 프로그램은 C:\NanroApp, 자료(책, 설정)는 C:\Nanro. 지우거나 새 버전을 덮어 깔아도 자료는 건드리지 않는다.
;   - 시작 메뉴에 아이콘을 만들고, 바탕화면 아이콘은 고를 수 있다.
; 만들기:  ISCC packaging\nanro.iss   (실행 파일 자리가 다르면  ISCC /DExePath=<nanro.exe 경로> packaging\nanro.iss)

#define AppVersion "0.1.1"
#ifndef ExePath
  #define ExePath "..\src-tauri\target\release\nanro.exe"
#endif

[Setup]
AppId={{12D12DE6-162A-471E-9EB4-D9271AE75FA7}
AppName=난로
AppVersion={#AppVersion}
AppVerName=난로 {#AppVersion}
AppPublisher=난로
DefaultDirName=C:\NanroApp
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=NanroSetup-v{#AppVersion}
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\nanro.exe
UninstallDisplayName=난로
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕화면에 아이콘 만들기"; GroupDescription: "추가 아이콘:"

[Files]
Source: "{#ExePath}"; DestDir: "{app}"; DestName: "nanro.exe"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\난로"; Filename: "{app}\nanro.exe"
Name: "{autodesktop}\난로"; Filename: "{app}\nanro.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\nanro.exe"; Description: "난로 켜기"; Flags: nowait postinstall skipifsilent
