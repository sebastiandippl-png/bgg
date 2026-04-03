# BGG Dashboard

A personal board-game statistics dashboard that uses BoardGameGeek (BGG) data only.

## Quick Start

1. Open `dist/bgstats-dashboard.html` in a browser.
2. Login with Google as admin (`sebastian.dippl@gmail.com`).
3. Click `Sync BGG` in the header.
4. The backend fetches owned games and plays for user `sebbes` and rebuilds `dist/bgg.db`.

## Data Source

The application no longer supports BGStats JSON upload/import.
All dashboard data comes from BGG sync endpoints.

Thing metadata sync also stores `games.best_with` using `poll-summary` values (for example: `Best with 3 players, Recommended with 2–4 players`).

The header also includes `Get Last Plays.` for incremental sync: it fetches only last-week plays and inserts only new play rows into existing tables without rebuilding `bgg.db`.

The `OnceUpon` tab shows three day-based cards with full play details (duration, players, winners):
- played today one week ago
- played today one year ago
- played today 5 years ago

## Project Structure

- `dist/bgstats-dashboard.html`: main dashboard UI
- `dist/js/`: frontend app modules and tab renderers
- `dist/api/sync_bgg.php`: admin-only sync trigger
- `dist/api/sync_bgg_status.php`: sync progress endpoint
- `dist/api/bgg_sync_service.php`: fetch + transform + SQLite rebuild
- `dist/api/sync_bgg_last_plays.php`: incremental last-week plays sync (non-destructive)
- `dist/api/get_db.php`: serves active `bgg.db`
- `dist/bgg.db`: active SQLite database used by the dashboard
- `dist/db_storage/`: backups, sync status, and cache files

## Deployment Notes

- Requires PHP with SQLite3 extension.
- Requires outbound access to BGG XML API.
- Keep `BGSTATS_BGG_API_KEY` server-side.
- Deploy with `./ionos_deploy.sh` from the project root (or any directory). The script now resolves `dist/` relative to the script location.
- The deploy uses checksum comparison and itemized rsync output, so changed assets like `dist/js/tabs/plays.js` are reliably uploaded and visible in deploy logs.
- Frontend assets in `dist/bgstats-dashboard.html` use `?v=20260402` cache-busting query params. Bump this version when you need to force clients/CDNs to fetch fresh JS/CSS.
