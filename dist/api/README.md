# BGG Dashboard API

## Endpoints

### GET|HEAD /api/get_db.php
Returns the active SQLite database file `dist/bgg.db`.

Behavior:
- `HEAD` can be used to check availability and read metadata headers.
- `GET` returns the SQLite binary.
- Direct browser access is blocked; requests must include `X-Requested-With: XMLHttpRequest`.

### GET /api/bgg_proxy.php
Server-side proxy for selected BoardGameGeek XML API endpoints.

Allowed endpoint values:
- `thing`
- `search`
- `hot`

The API token is injected server-side and never exposed to the browser.

### POST /api/sync_bgg.php
Admin-only sync endpoint that fetches collection and plays data for user `sebbes` and rebuilds `bgg.db`.

Example success response:
```json
{
  "success": true,
  "username": "sebbes",
  "insertedGames": 123,
  "insertedPlays": 456,
  "backupCreated": true,
  "syncedAt": "2026-04-01T10:00:00Z"
}
```

### GET /api/sync_bgg_status.php
Admin-only endpoint that returns lightweight sync progress state.

Typical states:
- `queued`
- `polling`
- `imported`
- `complete`
- `error`

## Environment Variables

- `BGSTATS_BGG_API_KEY`: Token used for BGG requests.
- `BGSTATS_GOOGLE_CLIENT_ID`: Google OAuth client ID for admin login.

## Local Config Fallback (No Env Vars)

If your production host cannot provide environment variables, create:

- `dist/api/local_config.php` (not committed)

Use this format:

```php
<?php
declare(strict_types=1);

return [
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
