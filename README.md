# VRC Package Crawler

This tool discovers, crawls, and indexes unlisted VRChat packages, tools, and libraries across BOOTH, GitHub, decentralized VPM repositories, Gumroad, and Jinxxy.
It saves all verified data into a local SQLite database.

## System Components

- Runtime: Bun JavaScript runtime (F:\dev_tools\.bun\bin\bun.exe).
- Database: SQLite with Write-Ahead Logging (crawler_state.db).
- Relevance Gatekeeper: Multi-tier semantic filter module (src/filter.ts).
- Logs: Text log files in the logs directory.

## File Locations

- Database: F:\.repo\.main\vrc-package-crawler\crawler_state.db
- Logs directory: F:\.repo\.main\vrc-package-crawler\logs\
  - crawler.log: General crawl and discovery events.
  - rate_limits.log: Rate limit events and sleep timers.
  - errors.log: Network and parse errors.
- Launcher script: F:\.repo\.main\vrc-package-crawler\run_crawler.bat
- Monitor launcher: F:\.repo\.main\vrc-package-crawler\watch_status.bat
- Purge utility: F:\.repo\.main\vrc-package-crawler\src\purge_pollution.ts

## Operating Procedures

### 1. View Live Progress

To view continuous live crawler progress, run this command:

```powershell
bun run src/status.ts
```

You can also run the monitor script:

```cmd
watch_status.bat
```

The screen clears and updates every second.
Push Ctrl + C to exit the monitor.

### 2. Start the Crawler

To start the crawler in a new terminal window, run this batch file:

```cmd
run_crawler.bat
```

You can also run this command in your terminal:

```powershell
bun run src/index.ts
```

### 3. Stop the Crawler

To stop the crawler safely, push Ctrl + C in the terminal window.
The engine finishes the active request, closes the database, and stops.

### 4. Run Relevance Purge and Audit

To audit the database and move non-tool records into quarantine, run this command:

```powershell
bun run src/purge_pollution.ts
```

The script evaluates all records, keeps verified tools, and moves other items to the quarantined_entities table.

## Checkpoint Milestones

Tell the Antigravity assistant when the crawler reaches these milestones:

1. Discovery Milestone: When Total Discovered reaches 5,000 URLs.
2. Ingestion Milestone: When Processed Done exceeds 1,000 items.
3. Saturation Milestone: When Saturation Index exceeds 90.00 percent.

The assistant will then start the translation and catalog generation phase.
