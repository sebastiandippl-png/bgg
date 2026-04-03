# BGG API Learnings & Known Issues

## BGG XMLAPI2 API Learnings

### Critical API Quirks & Workarounds

#### 1. Collection Endpoint Subtype Mislabeling

**Issue**: BGG's collection endpoint incorrectly labels expansions as boardgames when filtering by default parameters.

**Workaround**: Split collection fetches into two separate requests:
```
Request 1: collection endpoint with excludesubtype=boardgameexpansion
Request 2: collection endpoint with subtype=boardgameexpansion
```

**Why**: BGG documentation recommends this two-call pattern. Do NOT rely on single request with `own=1` filter alone — you'll get incorrect classification that persists in database.

**Code Location**: `dist/api/bgg_sync_service.php` → `fetch_owned_games_from_bgg()` function.

---

#### 2. Thing Endpoint HTTP 202 Pending Response

**Issue**: Thing endpoint returns HTTP 202 "Accepted" (not 200) when data is not yet cached on BGG servers.

**Handling**:
- Treat 202 same as success (data is valid, just queued)
- Retry on 202 with exponential backoff if critical
- Store HTTP status for debugging

**Code Location**: `dist/api/bgg_api.php` → `bgg_http_get()` function handles 202 as success.

---

#### 3. Plays Endpoint Has Unknown Totals

**Issue**: Plays endpoint paginated responses don't return total count upfront; you only learn total exists after fetching page 1.

**Workaround**: 
- Use page-based progress fallback in frontend: `Math.min(70, 60 + page*2)`
- Emit frequent granular status updates (every 25 plays + per page boundary)
- Don't show 0% progress

**Code Location**: 
- Backend: `dist/api/bgg_sync_service.php` → `fetch_plays_from_bgg()` emits progress after each page fetch
- Frontend: `dist/js/app/dashboard.js` → progress model handles "unknown total" phase

---

#### 4. Play Records May Have Missing Player Data

**Issue**: Some play records in BGG have malformed XML with missing `<players>` nodes, causing `foreach()` warnings.

**Solution**: Null-safe fallback during iteration:
```php
$playersNode = $play->players->player ?? [];
foreach ($playersNode as $player) {
    // safe iteration even if $playersNode is empty array
}
```

**Code Location**: `dist/api/bgg_sync_service.php` → `fetch_plays_from_bgg()` play parsing loop.

---

### Rate Limiting Strategy

**BGG Rate Limits:**
- No explicit published limit, but server returns 429 "Too Many Requests" under load
- Conservative approach: **5-second delay between requests to the same endpoint**
- Batch thing endpoint requests: 20 IDs per request maximum (reduces total requests)

**Implementation**:
```php
// In bgg_http_get():
usleep(5000000); // 5 seconds between calls
```

**Batching**: Thing endpoint accepts comma-separated IDs up to ~100, but testing shows batching 20 at a time keeps responses fast and reliable.

**Retry Backoff**: On 429/503/202, retry with exponential backoff:
- Initial: 1 second
- After 1 retry: 2 seconds
- After 2 retries: 4 seconds (max 3 retries total)

**Code Location**: `dist/api/bgg_api.php` → `bgg_http_get()` function.

---

### Collection Ingestion Model

**Original Approach (deprecated):**
- Fetch only `own=1` collection items
- Problem: Couldn't match plays against non-owned games
- Result: 651-209 plays remained unmatched

**Current Approach (full collection + ownership flag):**
- Fetch ALL collection items (owned + wishlist + trade)
- Store `owned` flag (0/1) for each game in database
- Use full collection for play matching; use `owned` flag for insights calculations
- Result: Only 209 unmatched plays (games from trades, old collections, or ID typos)

**Schema**:
```sql
-- games table includes ownership
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    bggId INTEGER,
    owned INTEGER,  -- 1 = in user's collection, 0 = wishlist/trade/other
    name TEXT,
    -- ... other columns
);
```

**Frontend Usage**:
- Play matching uses full `games` table (LEFT JOIN)
- Insights calculations use `WHERE owned=1` for owned-only metrics
- Fallback: If game not matched, extract `gameName` from play's `rawJson`

**Code Locations**: 
- Backend fetch: `dist/api/bgg_sync_service.php` → `fetch_owned_games_from_bgg()`
- Backend storage: Returns array with `"owned"` key per game
- Frontend query: `dist/js/app/data.js` → `loadPlays()` uses LEFT JOIN + rawJson fallback

---

### XML Parsing Gotchas

### Thing Poll Summary Uses Non-Standard Result Names

**Issue**: In `poll-summary` (`name="suggested_numplayers"`), BGG uses result names like `bestwith` and misspelled `recommmendedwith` (three "m"), so parsing by result `name` is brittle.

**Solution**: Parse all `poll-summary/result` `value` attributes and concatenate them for `games.best_with`.

**Example Stored Value**: `Best with 3 players, Recommended with 2–4 players`

**Code Location**: `dist/api/bgg_sync_service.php` → `parse_best_with_summary()`

**Thing Endpoint Response Structure**:
```xml
<items>
  <item id="224037">
    <yearpublished>2013</yearpublished>
    <statistics>
      <ratings>
        <average value="8.27"/>
        <bayesaverage value="8.04"/>
      </ratings>
    </statistics>
    <minplayers value="1"/>
    <maxplayers value="5"/>
    <minplaytime value="90"/>
    <maxplaytime value="180"/>
  </item>
</items>
```

**Extraction Notes**:
- Use SimpleXML with `LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING` flags
- Access nested nodes: `$item->statistics->ratings->average['value']`
- Always cast to string or int explicitly: `(int)$value`, `(string)$value`
- Check `isset()` before accessing attributes; don't assume structure

**Code Location**: `dist/api/bgg_sync_service.php` → `hydrate_games_with_bgg_details()` function.

---

## Known Issues & Solutions

### OnceUpon Uses Exact Date Keys, Not Week Buckets

**Requirement**: Show plays for "today one week/year/five years ago".

**Implementation**:
- Build exact `YYYY-MM-DD` keys for `today-7d`, `today-1y`, `today-5y`.
- Match against `play.Date` exactly.

**Why**: This keeps the feature deterministic and aligned with user expectation for specific historical day snapshots.

**Code Location**: `dist/js/app/selectors.js` → `getOnceUponViewModel()`

### Issue: Need Fast Recent Plays Sync Without Rebuilding DB

**Requirement**: Fetch only recent plays and avoid destructive database rebuild.

**Approach**:
- Request BGG plays with `mindate` set to last 7 days.
- Upsert with `INSERT OR IGNORE` into `plays`, `players`, and `play_players`.

**Why it works**: Play row IDs are deterministic (`bgg_play_<playId>_<quantityIndex>`), so duplicates are naturally ignored while new records are appended.

**Code Location**: `dist/api/sync_bgg_last_plays.php` + `dist/api/bgg_sync_service.php` (`append_recent_plays_to_existing_database()`)

### Issue: Frontend JS Changes Not Visible After Deploy

**Symptoms**: Updated files like `dist/js/tabs/plays.js` appear unchanged on server after running deploy.

**Root Causes**:
1. Relative deploy source path depended on current working directory.
2. Rsync quick-check (size + mtime) can skip content changes in edge cases.

**Fix**:
- Resolve deploy source path relative to `ionos_deploy.sh`.
- Use checksum-based sync and itemized output:
    - `--checksum`
    - `--itemize-changes`
- Add asset version query params in `dist/bgstats-dashboard.html` (for example `plays.js?v=20260402`) to bypass stale browser/CDN caches after deploy.

**Code Location**: `ionos_deploy.sh`

### Issue: Plays Count Mismatch (3763 vs 3972)

**Root Cause**: Frontend `loadPlays()` used INNER JOIN, silently dropping 209 unmatched plays.

**Solution**: Change to LEFT JOIN with fallback:
```sql
SELECT p.*, g.name as Game
FROM plays p
LEFT JOIN games g ON p.gameRefId = g.id
-- Now includes plays where g.id IS NULL
```

**Fallback Game Name**: If game not matched, extract from `p.rawJson`:
```javascript
let gameName = row[matchedGameIndex];
if (!gameName && rawJsonField) {
    try {
        const raw = JSON.parse(rawJsonField);
        if (raw?.gameName) gameName = raw.gameName.trim();
    } catch (_) {}
}
if (!gameName) gameName = gameId || 'Unknown Game';
```

**Location**: `dist/js/app/data.js` → `loadPlays()` function.

---

### Issue: BGG Collection Subtype Wrong

**Example**: Expansions labeled as boardgames, throwing off isExpansion flag.

**Fix**: Use two-request pattern (see **Collection Endpoint Subtype Mislabeling** above).

---

### Issue: Status Polling Stalls (Shows 0%, Not Refreshing)

**Causes**:
1. Session lock holding up requests → Fixed by `session_write_close()`
2. No status emitted during phase → Fixed by frequent emissions (every 25 plays, every batch)
3. Multiple polls in-flight → Fixed by in-flight guard in dashboard

**In-Flight Guard** (`dist/js/app/dashboard.js`):
```javascript
let statusPollInFlight = false;

async function pollStatus() {
    if (statusPollInFlight) return; // Skip if already fetching
    statusPollInFlight = true;
    try {
        const res = await fetch('/api/sync_bgg_status.php');
        // ... handle response
    } finally {
        statusPollInFlight = false;
    }
}
```

---

## Caching Strategy

### File-Based Cache

**Location**: `dist/db_storage/sync_cache/`

**Files**:
- `games.json` — Full games list after stage 1 (reused in stages 2 & 3)
- `plays.json` — Full plays list after stage 3

**Lifetime**: Persists until next sync. Safe to delete; will be re-fetched.

**Why Not Redis/Memcached?**: Lightweight hosting (no external services), sync happens infrequently (daily/weekly max).

---

### Status Persistence

**Location**: `dist/db_storage/sync_status.json`

**Content**:
```json
{
  "phase": "games_fetch",
  "progress": 35,
  "message": "Fetching collection...",
  "startTime": 1680000000,
  "lastUpdate": 1680000035
}
```

**Lifetime**: Until sync completes (phase=`ready`).

**Polling Endpoint**: `dist/api/sync_bgg_status.php` — Returns this JSON.

---

## Testing & Debugging Commands

### SQL: Check Play Matching Status
```bash
# Count matched vs unmatched plays
php -r '
$db = new SQLite3("dist/bgg.db");
$q = $db->query("
    SELECT 
        COUNT(*) as plays_all,
        SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END) as plays_matched,
        SUM(CASE WHEN g.id IS NULL THEN 1 ELSE 0 END) as plays_unmatched
    FROM plays p
    LEFT JOIN games g ON p.gameRefId = g.id
");
while($r = $q->fetchArray(SQLITE3_ASSOC)) {
    echo json_encode($r, JSON_PRETTY_PRINT);
}
'
```

### SQL: List Top Unmatched Game IDs
```bash
php -r '
$db = new SQLite3("dist/bgg.db");
$q = $db->query("
    SELECT p.gameRefId, COUNT(*) c 
    FROM plays p 
    LEFT JOIN games g ON p.gameRefId = g.id 
    WHERE g.id IS NULL 
    GROUP BY p.gameRefId 
    ORDER BY c DESC 
    LIMIT 10
");
while($r = $q->fetchArray(SQLITE3_ASSOC)) {
    echo $r[\"gameRefId\"].\"|\".$ r[\"c\"].\"\\n\";
}
'
```

### PHP: Test BGG API Connectivity
```php
<?php
require 'dist/api/bgg_api.php';
$response = bgg_http_get('collection', ['username' => 'your_username'], true);
echo "Status: " . $response['status'] . "\n";
echo "Body length: " . strlen($response['body']) . "\n";
echo "Preview: " . substr($response['body'], 0, 200) . "\n";
?>
```

---

## References

- **BGG XMLAPI2 Docs**: https://boardgamegeek.com/wiki/page/XML_API2
- **Thing Endpoint**: Returns game metadata (plays, players, ratings)
- **Collection Endpoint**: Returns user's collection with ownership levels
- **Plays Endpoint**: Returns paginated play history (subfilter by game)
- **Rate Limits**: Undocumented; 5-second throttle is empirically safe

---

**Last Updated**: April 2026
**Maintainer**: BGG Dashboard Project
**Purpose**: Document API quirks, workarounds, and debugging strategies
