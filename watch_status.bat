@echo off
cd /d "F:\.repo\.main\vrc-package-crawler"
"F:\dev_tools\.bun\bin\bun.exe" run src/status.ts
pause
