# BGG Dashboard Architecture

## Project Overview

The BGG Dashboard is a lightweight board game collection tracker that syncs data from BoardGameGeek (BGG) into a local SQLite database. The dashboard provides:
- Real-time collection synchronization with granular progress tracking
- Play statistics and player insights (h-index, total plays, owned games count)
- Three-stage sync pipeline: Get Games → Get Metadata → Get Plays
- Full collection ingestion with ownership tracking for insights

**Core Tech Stack:**
- **Backend**: PHP + SQLite3 (no ORM)
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **Data Ingestion**: BGG XMLAPI2 endpoints only
- **Hosting**: Static dist/ folder deployable anywhere

---

## Architecture: Three-Stage Sync Pipeline

### Why Split?

**Problem Solved:**
- Long-running syncs (metadata + plays) could hit PHP execution timeout (120s default)
- Status polling was blocked by session lock held during sync

**Solution: Staged Endpoints**
1. `sync_bgg_games.php` — Fetch full collection only (~30s)
2. `sync_bgg_metadata.php` — Enrich games with details (~2-3 min, batched)
3. `sync_bgg_plays.php` — Fetch all plays + build final DB (~5-10 min, paginated)

**Each stage:**
- Writes intermediate SQLite snapshot
- Emits granular progress updates
- Can be run independently (though usually sequential)
- Acts as a checkpoint for debugging

### Database Publishing Pattern

**Atomic Replace with Temp File:**
```php
// Write to temp file
$tempDb = sys_get_temp_dir() . "/bgg_temp_" . time() . ".db";
// ... build all data in $tempDb ...

// Atomic replace (avoids partial-read during write)
rename($tempDb, "/path/to/active/bgg.db");
```

**Why:**
- Browser cache won't serve half-written database
- Old clients can still read while new data is being written
- If process crashes, old database remains intact

**Code Location**: `dist/api/bgg_sync_service.php` → `create_synced_bgg_database()` function.

---

### Session Locking Fix

**Problem**: Long-running POST held PHP session lock, blocking concurrent GET status polls.

**Solution**: Release session after authentication:
```php
require_admin_json();  // Validates Google OAuth token
session_write_close(); // Release session lock immediately
// Now concurrent requests can proceed
```

**Code Location**: `dist/api/auth.php` — Called at start of all sync endpoints.

---

### Execution Timeout Fix

**Problem**: `usleep(5000000)` throttling could exceed 120s default execution timeout.

**Solution**: Disable timeout after auth:
```php
require_admin_json();
set_time_limit(0); // No timeout
// ... long-running operations ...
```

**Code Location**: All three sync endpoints (`sync_bgg_*.php`) after `require_admin_json()` call.

---

## Common Workflows

### Trigger a Full Sync from Dashboard

Admin user clicks "Get Games" → "Get Metadata" → "Get Plays + Build DB" buttons sequentially.

**Frontend** (`dist/bgstats-dashboard.html`):
```html
<button onclick="syncGames()">Get Games</button>
<button onclick="syncMetadata()">Get Metadata</button>
<button onclick="syncPlays()">Get Plays + Build DB</button>
```

**Progress Tracking**: Status polling happens every 500ms via `sync_bgg_status.php` until phase=`ready`.

---

## Database Schema

### games table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY | Internal ID (usually `bggId` or `bgg_<bggId>`) |
| bggId | INTEGER | BGG numeric ID |
| owned | INTEGER | 0 = wishlist/trade, 1 = in collection |
| name | TEXT | Game title |
| isExpansion | INTEGER | 1 if expansion, 0 if base game |
| isBaseGame | INTEGER | 1 if base game, 0 if expansion |
| yearPublished | INTEGER | Year game first published |
| avgRating | REAL | BGG average rating 1-10 |
| minPlayers | INTEGER | Minimum players |
| maxPlayers | INTEGER | Maximum players |
| minPlaytime | INTEGER | Min playtime (minutes) |
| maxPlaytime | INTEGER | Max playtime (minutes) |
| avgPlaytime | INTEGER | Average playtime (minutes) |

### plays table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY | Auto-increment |
| gameRefId | TEXT | Foreign key → games.id (may be NULL if unmatched) |
| playDate | TEXT | ISO date (YYYY-MM-DD) |
| durationMin | INTEGER | Playtime in minutes |
| playerScores | TEXT | JSON array `[{name, score, placement}, ...]` |
| rawJson | TEXT | Full play record from BGG (fallback for unmatched games) |

### players table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY | Player name (deduplicated) |
| name | TEXT | Display name |

**Relationships**:
- `plays.gameRefId` → `games.id` (LEFT JOIN for unmatched plays)
- `plays.playerScores` → array of player names → `players.id`

---

## Performance Notes

### Expected Timings

- **Games fetch (stage 1)**: 30–60 seconds (depends on collection size: typically 200-500 games)
- **Metadata fetch (stage 2)**: 2–5 minutes (batches of 20, 5-second throttle per batch)
- **Plays fetch (stage 3)**: 5–15 minutes (paginated, 20 pages per 5-second request, 100+ plays per page)
- **Total full sync**: 8–25 minutes

### Bottleneck: Thing Endpoint

Metadata enrichment is slowest because:
- 5-second delay between batch requests (rate limit safety)
- Each batch requires XML parsing + DB insert
- Can't parallelize (would trigger rate limiting)

**Optimization opportunity**: Could cache metadata longer (reuse from previous sync), only fetch new games. Currently always refetches all.

---

## Deployment

### dist/ Folder Structure

```
dist/
  ├── bgg-dashboard.html       # Main app (entry point)
  ├── bgg.db                   # Active SQLite database
  ├── api/                      # Backend endpoints
  │   ├── auth.php
  │   ├── bgg_api.php
  │   ├── bgg_sync_service.php
  │   ├── sync_bgg_games.php
  │   ├── sync_bgg_metadata.php
  │   ├── sync_bgg_plays.php
  │   └── sync_bgg_status.php
  ├── js/app/                   # Frontend modules
  │   ├── dashboard.js
  │   ├── data.js
  │   ├── selectors.js
  │   └── auth-ui.js
  └── db_storage/               # Caches & backups
      ├── sync_cache/           # games.json, plays.json
      ├── sync_status.json      # Current sync status
      └── backups/              # Timestamped DB snapshots
```

### Deployment Requirements

- PHP 7.4+
- SQLite3 support (bundled with PHP)
- HTTPS (for Google OAuth)
- Writable `db_storage/` directory (for caches & backups)
- Writable `bgg.db` file

### Safe Deployment

1. Backup current `bgg.db`
2. Deploy new code
3. No database migrations needed (schema is rebuilt each sync)
4. Users can immediately re-sync to pick up any changes

---

**Last Updated**: April 2026
**Status**: Stable three-stage sync pipeline in production
