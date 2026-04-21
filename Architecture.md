# BGG Dashboard Architecture

## Project Overview

The BGG Dashboard is a lightweight board game collection tracker that syncs data from BoardGameGeek (BGG) into a local SQLite database. The dashboard provides:
- Real-time collection synchronization with granular progress tracking
- Play statistics and player insights (h-index, total plays, owned games count)
- Three-stage sync pipeline: Get Games → Get Metadata → Get Plays
- Full collection ingestion with ownership tracking for insights
- Historical day snapshots in the OnceUpon tab (today-7d, today-1y, today-5y)

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
4. `sync_bgg_new_games.php` — Fetch collection, append only games not yet present, and reconcile collection status flags (no DB rebuild)
5. `sync_bgg_last_plays.php` — Fetch only last-week plays and append only missing rows (no DB rebuild)

**Each stage:**
- Writes intermediate SQLite snapshot
- Emits granular progress updates
- Can be run independently (though usually sequential)
- Acts as a checkpoint for debugging

**Incremental stage behavior (`sync_bgg_last_plays.php`):**
- Requests BGG plays with `mindate=<today-7d>`
- Uses `INSERT OR IGNORE` on `plays`, `players`, and `play_players`
- Keeps existing `bgg.db` and all existing rows intact (no delete/recreate)

**Incremental stage behavior (`sync_bgg_new_games.php`):**
- Requests the full collection using the same fetch path as `sync_bgg_games.php`
- Compares fetched `bggId` values with `games.bggId` already in `bgg.db`
- Inserts only missing games into `games`
- Updates collection status columns from BGG when existing rows changed
- Removes games no longer present in the fetched collection (no delete/recreate)

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

For quick updates between full syncs, admin can use Delta Sync actions:
- `Get New Games` to append only newly owned titles
- `Game Metadata Delta Sync` to fill metadata gaps
- `Get Last Plays` to append only recent plays

### OnceUpon Tab Flow

- Selector: `getOnceUponViewModel(state)` in `dist/js/app/selectors.js`
- Renderer: `renderOnceUponTab(...)` in `dist/js/tabs/onceupon.js`
- Card dates are resolved as exact date keys (`YYYY-MM-DD`) for:
  - today minus 7 days
  - today minus 1 year
  - today minus 5 years
- Matching plays are displayed with the same card detail format as Last Plays (date, duration, players, winner).

### Tab Deep Links

- Tabs are URL-addressable via hash (`#insights`, `#plays`, `#onceupon`, `#nextplay`, `#wanttobuy`, `#gamestats`, `#playerstats`, `#admin`).
- On app init, dashboard reads the current hash and sets the initial active tab.
- On tab switch, dashboard updates the hash so links can be shared/bookmarked.
- `hashchange` handling keeps browser back/forward navigation in sync with the active tab.

### WantToBuy Tab Flow

- Selector: `getWantToBuyViewModel(state)` in `dist/js/app/selectors.js`
- Renderer: `renderWantToBuyTab(...)` in `dist/js/tabs/wanttobuy.js`
- Data source: `state.games` filtered by `wantToBuy === true`
- Price lookup: each WantToBuy card calls both `dist/api/get_game_price.php` (Brettspielpreise best offer) and `dist/api/get_funtainment_prices.php` (top 5 compact title/price/link entries)
- Cache behavior: `get_funtainment_prices.php` stores one file per normalized game name with a 24-hour TTL
- Search normalization: when a game name includes `:`, only the substring before `:` is used for Funtainment search

### Next Tab Flow

- Selector: `getNextplayViewModel(state)` in `dist/js/app/selectors.js`
- Renderer: `renderNextplayTab(...)` in `dist/js/tabs/nextplay.js`
- Data source: `state.games` filtered to owned base games not played in over a year (or never played)
- Grouping: three weight buckets (`complex`, `medium`, `light`) sorted by longest-not-played first
- Category headers: each group title includes the current game count (`N games`)
- Top summary: renderer shows three random picks per non-empty category in a `Random picks per category` card list (`Best for 2 players`, `Best for 3 players`, `Best for 4 players`) linked to Game Stats
- Pick selection priority for each target player count: `best_with` match first, then `recommended_with`, then min/max player range fallback
- Random-pick state: dashboard stores selected game IDs per category and target player count so picks remain stable across rerenders; clicking the `Next` tab explicitly triggers a reroll

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
| id | TEXT PRIMARY | Internal ID (`bgg_<bggId>`) |
| bggId | INTEGER | BGG numeric ID |
| owned | INTEGER | 0 = wishlist/trade, 1 = in collection |
| prev_owned | INTEGER | 1 if previously owned on BGG |
| for_trade | INTEGER | 1 if marked for trade on BGG |
| want | INTEGER | 1 if marked want on BGG |
| want_to_play | INTEGER | 1 if marked want to play on BGG |
| want_to_buy | INTEGER | 1 if marked want to buy on BGG |
| wishlist | INTEGER | 1 if marked wishlist on BGG |
| preordered | INTEGER | 1 if marked preordered on BGG |
| name | TEXT | Game title |
| isExpansion | INTEGER | 1 if expansion, 0 if base game |
| isBaseGame | INTEGER | 1 if base game, 0 if expansion |
| bggYear | INTEGER | Year game first published |
| rating | REAL | User's personal BGG rating |
| average_rating | REAL | BGG community average rating 1–10 |
| bgg_rating | REAL | BGG Bayesian average (GeekRating) |
| weight | REAL | BGG community complexity weight |
| best_with | TEXT | Best player count from `poll-summary` (e.g. `3`) |
| recommended_with | TEXT | Recommended player count range from `poll-summary` (e.g. `2-4`) |
| designer | TEXT | Comma-separated designer names |
| minPlayerCount | INTEGER | Minimum players |
| maxPlayerCount | INTEGER | Maximum players |
| minPlayTime | INTEGER | Min playtime (minutes) |
| maxPlayTime | INTEGER | Max playtime (minutes) |
| urlThumb | TEXT | Thumbnail image URL |
| bgg_lastmodified | TEXT | `status.lastmodified` from the BGG collection feed |
| syncedAt | TEXT | ISO timestamp of last sync |
| rawJson | TEXT | Full raw payload from BGG collection/thing API |

### plays table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY | Deterministic ID (`bgg_play_<playId>_<qty>`) |
| gameRefId | TEXT | Foreign key → games.id |
| playDate | TEXT | ISO date (YYYY-MM-DD) |
| durationMin | INTEGER | Playtime in minutes |
| quantity | INTEGER | Number of plays for this record (usually 1) |
| location | TEXT | Location string from BGG |
| comments | TEXT | Play comments from BGG |
| rawJson | TEXT | Full raw play record from BGG |

### players table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY | Stable player ref ID (`bgg_player_<userId>` or hash-based) |
| name | TEXT | Display name |

### play_players table

Normalized per-player rows extracted from each play. Enables efficient player-centric queries without JSON parsing.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY | `<playId>_idx_<index>` — deterministic, unique per play row |
| playId | TEXT | Foreign key → plays.id |
| playerRefId | TEXT | Foreign key → players.id (nullable) |
| playerName | TEXT | Player display name (denormalized for query convenience) |
| score | REAL | Numeric score (nullable) |
| winner | INTEGER | 1 if winner, 0 otherwise |

**Relationships**:
- `plays.gameRefId` → `games.id` (LEFT JOIN for unmatched plays)
- `play_players.playId` → `plays.id`
- `play_players.playerRefId` → `players.id`

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
  ├── bgstats-dashboard.html  # Main app (entry point)
  ├── bgg.db                   # Active SQLite database
  ├── api/                      # Backend endpoints
  │   ├── auth.php
  │   ├── bgg_api.php
  │   ├── bgg_sync_service.php
  │   ├── sync_bgg_games.php
  │   ├── sync_bgg_metadata.php
  │   ├── sync_bgg_plays.php
  │   ├── sync_bgg_last_plays.php
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
