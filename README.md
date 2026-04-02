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

## Project Structure

- `dist/bgstats-dashboard.html`: main dashboard UI
- `dist/js/`: frontend app modules and tab renderers
- `dist/api/sync_bgg.php`: admin-only sync trigger
- `dist/api/sync_bgg_status.php`: sync progress endpoint
- `dist/api/bgg_sync_service.php`: fetch + transform + SQLite rebuild
- `dist/api/get_db.php`: serves active `bgg.db`
- `dist/bgg.db`: active SQLite database used by the dashboard
- `dist/db_storage/`: backups, sync status, and cache files

## Deployment Notes

- Requires PHP with SQLite3 extension.
- Requires outbound access to BGG XML API.
- Keep `BGSTATS_BGG_API_KEY` server-side.
