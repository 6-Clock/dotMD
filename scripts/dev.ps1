# Runs dotMD in dev mode with the MSVC build environment loaded.
#
# This machine's Visual Studio Build Tools install is incomplete: vswhere.exe is
# missing and the Windows SDK lib paths are unregistered, so both vcvars64.bat
# and a plain `npm run tauri dev` fail to link ("cannot open input file
# 'dbghelp.lib'"). The MSVC compiler/linker and the Windows SDK files ARE on
# disk, so this script points LIB / INCLUDE / PATH straight at them and then
# runs Tauri. Use it until the Build Tools install is repaired (see README).

$ErrorActionPreference = "Stop"

$vcRoot = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
$sdk = "C:\Program Files (x86)\Windows Kits\10"

if (-not (Test-Path $vcRoot)) { Write-Error "MSVC tools not found at $vcRoot" }
if (-not (Test-Path "$sdk\Lib")) { Write-Error "Windows SDK not found at $sdk" }

# Pick the newest installed MSVC and SDK versions.
$vc = (Get-ChildItem $vcRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$ver = (Get-ChildItem "$sdk\Lib" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name

$env:LIB = "$vc\lib\x64;$sdk\Lib\$ver\ucrt\x64;$sdk\Lib\$ver\um\x64"
$env:INCLUDE = "$vc\include;$sdk\Include\$ver\ucrt;$sdk\Include\$ver\um;$sdk\Include\$ver\shared"
$env:PATH = "$vc\bin\HostX64\x64;$sdk\bin\$ver\x64;$env:USERPROFILE\.cargo\bin;$env:PATH"

Write-Host "MSVC $(Split-Path $vc -Leaf) + Windows SDK $ver" -ForegroundColor Green

Set-Location (Split-Path $PSScriptRoot -Parent)
npm run tauri dev
