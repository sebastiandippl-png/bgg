# BGG Dashboard API

## Endpoints

### GET|HEAD /api/get_db.php
Returns the active SQLite database file `dist/bgg.db`.

Behavior:
- `HEAD` can be used to check availability and read metadata headers.
- `GET` returns the SQLite binary.
- Direct browser access is blocked; requests must include `X-Requested-With: XMLHttpRequest`.

### POST /api/sync_bgg_new_games.php
Admin-only incremental endpoint.

Behavior:
- Fetches the full collection from BGG.
- Compares fetched `bggId` values against existing rows in `games`.
- Inserts only games that are not yet present.
- Updates collection status columns (`owned`, `prev_owned`, `for_trade`, `want`, `want_to_play`, `want_to_buy`, `wishlist`, `preordered`, `bgg_lastmodified`) for existing rows when they changed on BGG.
- Removes games from `games` when they are no longer present in the fetched collection.
- Does not delete or recreate `bgg.db`.

### GET /api/sync_bgg_status.php
Admin-only endpoint that returns lightweight sync progress state.

Typical states:
- `queued`
- `polling`
- `imported`
- `complete`
- `error`

### GET /api/trigger_last_plays.php
API key-protected endpoint to trigger a last plays sync.

Query Parameters:
- `apiKey` (required): The API key configured in `BGSTATS_API_KEY`.

Behavior:
- Fetches plays from the last 7 days from BGG.
- Appends new plays to the existing database.
- Returns a JSON response with sync results.
- Prevents accidental triggering by bots through API key requirement.

Example:
```bash
curl "https://your-domain.com/api/trigger_last_plays.php?apiKey=YOUR_API_KEY"
```

Response on success:
```json
{
  "success": true,
  "step": "last_week_plays",
  "username": "your-bgg-username",
  "lookbackDays": 7,
  "minDate": "2026-04-09",
  "insertedGames": 0,
  "insertedPlays": 5,
  "fetchedPlays": 10,
  "publishDb": true,
  "syncedAt": "2026-04-16T14:30:00+00:00"
}
```

Error responses:
- `401 Unauthorized`: Missing or invalid API key
- `405 Method Not Allowed`: Request was not GET
- `409 Conflict`: Sync already running
- `500 Internal Server Error`: BGG sync failed

### POST /api/upload_bgg_dump.php
Admin-only endpoint for uploading a BoardGameGeek CSV dump.

Behavior:
- Requires `X-Requested-With: XMLHttpRequest` header.
- Requires an authenticated admin session.
- Expects multipart form field `dump_csv`.
- Validates `.csv` extension and file size (max 30 MB).
- Stores file in `dist/db_storage/bgg_dump_latest.csv` (atomic replace).
- Invalidates `dist/db_storage/bgg_top_games_cache.json` after successful upload.

Response on success:
```json
{
  "success": true,
  "fileName": "bgg_dump_latest.csv",
  "bytes": 123456,
  "uploadedAt": "2026-06-11T11:22:33+00:00"
}
```

### GET /api/get_bgg_top_games.php
Returns top games from uploaded CSV dump for each year from current year down to 1990.

Behavior:
- Requires `X-Requested-With: XMLHttpRequest` header.
- Reads `dist/db_storage/bgg_dump_latest.csv`.
- Builds year buckets for `currentYear` through `1990` (UTC).
- Filters rows where `yearpublished` equals each bucket year.
- Sorts each year bucket by `rank` ascending and returns top 10 per year.
- Maps each game against `games.bggId` in `dist/bgg.db` and exposes `owned=true` when `games.owned=1`.
- Adds `top10Count` per year for games in that year whose overall rank is `<= 10`.
- Adds `top100Count` per year for games in that year whose overall rank is `<= 100`.
- Caches computed payload in `dist/db_storage/bgg_top_games_cache.json` keyed by dump file mtime/size.

Response on success:
```json
{
  "success": true,
  "year": 2026,
  "minYear": 1990,
  "count": 10,
  "cached": false,
  "computedAt": "2026-06-11T12:34:56+00:00",
  "games": [
    {
      "id": 12345,
      "name": "Example Game",
      "yearpublished": 2026,
      "rank": 17,
      "geek_rating": 7.53214,
      "owned": true
    }
  ],
  "years": [
    {
      "year": 2026,
      "count": 10,
      "top10Count": 1,
      "top100Count": 3,
      "games": []
    },
    {
      "year": 2025,
      "count": 10,
      "top10Count": 0,
      "top100Count": 2,
      "games": []
    }
  ]
}
```

## Environment Variables

- `BGSTATS_BGG_USERNAME`: BGG username whose collection and plays are synced.
- `BGSTATS_BGG_API_KEY`: Token used for BGG requests.
- `BGSTATS_GOOGLE_CLIENT_ID`: Google OAuth client ID for admin login.
- `BGSTATS_ADMIN_EMAIL`: Email address of the admin user.
- `BGSTATS_API_KEY`: API key for `trigger_last_plays.php` endpoint.

## Local Config Fallback (No Env Vars)

If your production host cannot provide environment variables, create:

- `dist/api/local_config.php` (not committed)

Use this format:

```php
<?php
declare(strict_types=1);

return [
  'BGSTATS_BGG_USERNAME' => 'your-bgg-username',
  'BGSTATS_BGG_API_KEY' => 'your-real-key-here',
  'BGSTATS_GOOGLE_CLIENT_ID' => 'your-google-oauth-client-id',
  'BGSTATS_ADMIN_EMAIL' => 'admin@example.com',
];
```

A template is available at `dist/api/local_config.php.example`.

## Storage

- Active database: `dist/bgg.db`
- Backups: `dist/db_storage/bgg_backup_*.db`
- Sync status: `dist/db_storage/bgg_sync_status.json`
