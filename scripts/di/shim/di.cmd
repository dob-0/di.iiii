@echo off
rem The `di` on your PATH, Windows side. Same job as shim/di: find a node, hand
rem over to the installed CLI, stay small enough that it never has to change.

setlocal
if "%DI_HOME%"=="" set "DI_HOME=%USERPROFILE%\.di"

set "DI_NODE=%DI_HOME%\runtime\node\node.exe"
if not exist "%DI_NODE%" set "DI_NODE=node"

if not exist "%DI_HOME%\current\cli\cli.mjs" (
    echo di.iiii is not installed here ^(%DI_HOME%^). 1>&2
    echo install it with:  irm https://di-studio.xyz/get.ps1 ^| iex 1>&2
    exit /b 1
)

"%DI_NODE%" "%DI_HOME%\current\cli\cli.mjs" %*
exit /b %ERRORLEVEL%
