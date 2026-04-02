<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/bgg_sync_service.php';
require_once __DIR__ . '/bgg_sync_status_store.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'method_not_allowed']);
    exit;
}

$requestedWith = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
if ($requestedWith !== 'xmlhttprequest') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'invalid_request']);
    exit;
}

require_admin_json();

if (function_exists('set_time_limit')) {
    @set_time_limit(0);
}

write_bgg_sync_status([
    'state' => 'queued',
    'phase' => 'queued',
    'message' => 'Game metadata sync queued.',
    'username' => BGG_SYNC_USERNAME,
    'currentGames' => 0,
    'totalGames' => null,
    'currentPlays' => 0,
    'totalPlays' => 0,
]);

try {
    $gamesCache = read_bgg_sync_cache('games');
    $games = is_array($gamesCache['games'] ?? null) ? $gamesCache['games'] : [];
    if ($games === []) {
        throw new RuntimeException('sync_cache_missing_games');
    }

    $hydratedGames = hydrate_games_with_bgg_details($games);
    write_bgg_sync_cache('games', [
        'username' => BGG_SYNC_USERNAME,
        'fetchedAt' => (string)($gamesCache['fetchedAt'] ?? gmdate('c')),
        'metadataSyncedAt' => gmdate('c'),
        'games' => $hydratedGames,
    ]);

    $result = create_synced_bgg_database($hydratedGames, [], []);

    write_bgg_sync_status([
        'state' => 'complete',
        'phase' => 'metadata_complete',
        'message' => 'Game metadata fetched and cached.',
        'username' => BGG_SYNC_USERNAME,
        'insertedGames' => count($hydratedGames),
        'insertedPlays' => 0,
        'currentGames' => count($hydratedGames),
        'totalGames' => count($hydratedGames),
        'currentPlays' => 0,
        'totalPlays' => 0,
    ]);

    echo json_encode([
        'success' => true,
        'step' => 'metadata',
        'username' => BGG_SYNC_USERNAME,
        'insertedGames' => $result['insertedGames'],
        'insertedPlays' => $result['insertedPlays'],
        'publishDb' => true,
        'gameCount' => count($hydratedGames),
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $exception) {
    $code = preg_replace('/[^a-z0-9_\-]/i', '', (string)$exception->getMessage());
    if ($code === '') {
        $code = 'bgg_metadata_sync_failed';
    }

    write_bgg_sync_status([
        'state' => 'error',
        'phase' => 'error',
        'message' => $code,
        'username' => BGG_SYNC_USERNAME,
    ]);

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $code,
    ]);
}
