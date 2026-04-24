# Project Overview

The BGG Dashboard is a personal board game statistics dashboard that syncs data from BoardGameGeek (BGG) into a local SQLite database served to a single-page frontend. Single user only — the BGG username is hardcoded via `BGSTATS_BGG_USERNAME` (env var or `local_config.php`).

**Core Tech Stack:**
- **Backend**: PHP 7.4+ + SQLite3 (no ORM, no framework, raw SQL)
- **Frontend**: Vanilla JavaScript + Tailwind CSS (no build step, no bundler)
- **Data Source**: BGG XMLAPI2 only
- **Entry Point**: `dist/bgstats-dashboard.html`
- **Database**: `dist/bgg.db` (SQLite, rebuilt on full sync, append-only on incremental sync)
- **Hosting**: `dist/` folder deployable anywhere with PHP + SQLite3

## Dashboard Tabs

| Tab | File | Description |
|-----|------|-------------|
| Last Plays | `dist/js/tabs/plays.js` | Recent play log; monthly thumbnail collage for previous month |
| Most Played | `dist/js/tabs/mostplayed.js` | Top games by play count |
| Next Play | `dist/js/tabs/nextplay.js` | Random game picker; best_with-based picks for 2/3/4 players |
| Insights | `dist/js/tabs/insights.js` | h-index, total plays, owned count |
| Player Stats | `dist/js/tabs/playerstats.js` | Win rate + weighted win rate per player |
| Game Stats | `dist/js/tabs/gamestats.js` | Per-game detail stats |
| OnceUpon | `dist/js/tabs/onceupon.js` | Historical day snapshots: today-7d, today-1y, today-5y |
| WantToBuy | `dist/js/tabs/wanttobuy.js` | want_to_buy=1 games with Brettspielpreise + Funtainment prices |
| Admin | `dist/js/tabs/admin.js` | Sync controls (Get Games / Get Metadata / Get Plays) |

## Key Backend Files

| File | Purpose |
|------|---------|
| `dist/api/bgg_sync_service.php` | Core sync logic: `fetch_owned_games_from_bgg()`, `fetch_plays_from_bgg()`, `create_synced_bgg_database()` |
| `dist/api/bgg_api.php` | `bgg_http_get()` — HTTP wrapper with 5s throttle, 202/429/503 handling |
| `dist/api/auth.php` | `require_admin_json()` — Google OAuth token validation; always call then `session_write_close()` |
| `dist/api/sync_bgg_games.php` | Stage 1: fetch full collection |
| `dist/api/sync_bgg_metadata.php` | Stage 2: enrich games with Thing metadata (batches of 20) |
| `dist/api/sync_bgg_plays.php` | Stage 3: fetch all plays + rebuild bgg.db |
| `dist/api/sync_bgg_new_games.php` | Incremental: insert/update/remove games, no DB rebuild |
| `dist/api/sync_bgg_last_plays.php` | Incremental: append last-week plays only |
| `dist/api/sync_bgg_metadata_delta.php` | Incremental: fill missing metadata for existing DB |
| `dist/api/sync_bgg_status.php` | Polled every 500ms by frontend; returns phase + progress |
| `dist/api/get_game_price.php` | Brettspielpreise best offer (24h cache) |
| `dist/api/get_funtainment_prices.php` | Funtainment top-5 prices (24h cache) |

## Key Frontend Files

| File | Purpose |
|------|---------|
| `dist/js/app/dashboard.js` | App bootstrap, tab routing, sync orchestration, progress model |
| `dist/js/app/data.js` | SQLite DB load (sql.js), all query functions |
| `dist/js/app/state.js` | Shared app state |
| `dist/js/app/selectors.js` | Reusable DOM selectors |
| `dist/js/app/auth-ui.js` | Google OAuth UI |

## Database Schema (bgg.db)

**games** — one row per game/expansion in collection
- `id` TEXT PK (`bgg_<bggId>`), `bggId` INTEGER, `name` TEXT
- Collection flags (INTEGER 0/1): `owned`, `prev_owned`, `for_trade`, `want`, `want_to_play`, `want_to_buy`, `wishlist`, `preordered`
- `isExpansion`, `isBaseGame`, `bggYear`, `rating`, `average_rating`, `bgg_rating`, `weight`
- `best_with` TEXT (e.g. `3`), `recommended_with` TEXT (e.g. `2-4`) — from BGG poll-summary
- `designer`, `minPlayerCount`, `maxPlayerCount`, `minPlayTime`, `maxPlayTime`, `urlThumb`
- `bgg_lastmodified`, `syncedAt`, `rawJson`

**plays** — one row per play record
- `id` TEXT PK (`bgg_play_<playId>_<qty>`), `gameRefId` → games.id, `playDate` TEXT (YYYY-MM-DD)
- `durationMin`, `quantity`, `location`, `comments`, `rawJson`

**players** — one row per unique player
- `id` TEXT PK (`bgg_player_<userId>` or hash), `name` TEXT

**play_players** — normalized per-player per-play rows
- `id` TEXT PK (`<playId>_idx_<index>`), `playId` → plays.id, `playerRefId` → players.id
- `playerName` TEXT (denormalized), `score` REAL, `winner` INTEGER

## Critical Patterns & Conventions

### Authentication Pattern (all sync endpoints)
```php
require_admin_json();   // validate Google OAuth token
session_write_close();  // release session lock immediately (prevents blocking status polls)
set_time_limit(0);      // no timeout for long-running operations
```

### Atomic DB Publish
```php
$tempDb = sys_get_temp_dir() . "/bgg_temp_" . time() . ".db";
// ... build all data ...
rename($tempDb, "path/to/bgg.db"); // atomic replace
```

### BGG Collection Fetch — Two Requests Required
BGG mislabels expansions when using a single request. Always split:
1. `excludesubtype=boardgameexpansion` — gets base games
2. `subtype=boardgameexpansion` — gets expansions

### BGG Rate Limiting
- 5-second delay between all API requests (`usleep(5000000)`)
- Batch Thing endpoint calls: 20 IDs per request
- Retry with exponential backoff on 429/503; treat 202 as success

### Incremental Sync (last plays)
- `INSERT OR IGNORE` on `plays`, `players`, `play_players`
- Never deletes or rebuilds `bgg.db`

### Pricing (WantToBuy tab)
- If game name contains `:`, only use the part before `:` for price lookup
- Cache responses for 24 hours per normalized game name

### Next Tab — Random Picks
- Show picks only for `best_with` matching target player count (2, 3, 4)
- Pick state stored in dashboard to stay stable across rerenders; rerolls only on tab click

### Player Stats — Win Rate
- **Win Rate**: wins / total plays
- **Weighted Win Rate** (BGG style): per-play value = `0` on loss, `(player_count / 2) * 100` on win; averaged

## Instructions

- always keep README.md up to date using best practices for readme files
- always keep Architecture.md up to date when introducing new architecture patterns or changing existing patterns
- always keep Learnings.md, Architecture.md, README.md up to date when we learn something that should be remembered
- check if any new or renamed files need to be added to .gitignore
- all visible UI text must be English
- always check for browser and mobile-friendly design
- no ORM, no framework, no bundler — keep the stack minimal and consistent with existing code
- new backend endpoints must always call `require_admin_json()` then `session_write_close()` before doing work
- prefer extending existing files over creating new ones unless the feature is clearly a new tab or service