# Legacy Launch Scripts

These are pre-redesign launch methods archived for reference.
Do not use these files. Use the compiled binaries in `dist/` instead.

The `.bat` launchers (`run_crawler.bat`, `watch_status.bat`) were removed from the
repository root as part of the September 2026 architecture redesign.

The crawler was redesigned from a single-run saturation tool into a continuous 24/7
discovery daemon with standalone compiled binaries and Poisson refresh scheduling.

| Old Method          | New Method                  |
|---------------------|-----------------------------|
| run_crawler.bat     | dist\vrc-crawler.exe        |
| watch_status.bat    | dist\vrc-monitor.exe        |
