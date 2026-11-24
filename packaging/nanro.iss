; 난로 설치 파일(Inno Setup 6). 코스모스와 같은 규칙을 따른다.
;   - 관리자 권한 없이 설치한다.
;   - 프로그램은 C:\NanroApp, 자료(책, 설정)는 C:\Nanro. 지우거나 새 버전을 덮어 깔아도 자료는 건드리지 않는다.
;   - 시작 메뉴에 아이콘을 만들고, 바탕화면 아이콘은 고를 수 있다.
;   - 책 파일(.epub, .pdf)의 "연결 프로그램" 목록에 난로를 올린다. 기본 프로그램은 바꾸지 않는다.
; 만들기:  ISCC packaging\nanro.iss   (실행 파일 자리가 다르면  ISCC /DExePath=<nanro.exe 경로> packaging\nanro.iss)

#define AppVersion "0.5.0"
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
ChangesAssociations=yes

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

; 책 파일을 오른쪽 단추로 눌렀을 때 "연결 프로그램"에 난로가 나오게 한다. 지금 쓰는 사용자에게만 적용하고(관리자 권한 없음),
; 어떤 확장자의 기본 프로그램도 바꾸지 않는다. 난로를 지우면 함께 지워진다.
[Registry]
Root: HKCU; Subkey: "Software\Classes\Applications\nanro.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "난로"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\nanro.exe\shell\open\command"; ValueType: string; ValueData: """{app}\nanro.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\Applications\nanro.exe\SupportedTypes"; ValueType: string; ValueName: ".epub"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\nanro.exe\SupportedTypes"; ValueType: string; ValueName: ".pdf"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Nanro.Book"; ValueType: string; ValueData: "난로 책"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Nanro.Book\DefaultIcon"; ValueType: string; ValueData: "{app}\nanro.exe,0"
Root: HKCU; Subkey: "Software\Classes\Nanro.Book\shell\open\command"; ValueType: string; ValueData: """{app}\nanro.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.epub\OpenWithProgids"; ValueType: string; ValueName: "Nanro.Book"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.pdf\OpenWithProgids"; ValueType: string; ValueName: "Nanro.Book"; ValueData: ""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\nanro.exe"; Description: "난로 켜기"; Flags: nowait postinstall skipifsilent
