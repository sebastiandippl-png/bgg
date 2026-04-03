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
    'message' => 'Plays sync queued.',
    'username' => get_bgg_sync_username(),
    'currentGames' => 0,
    'totalGames' => null,
    'currentPlays' => 0,
    'totalPlays' => null,
]);

try {
    $gamesCache = read_bgg_sync_cache('games');
    $games = is_array($gamesCache['games'] ?? null) ? $gamesCache['games'] : [];
    if ($games === []) {
        throw new RuntimeException('sync_cache_missing_games');
    }

    $playsPayload = fetch_plays_from_bgg(get_bgg_sync_username(), count($games));
    write_bgg_sync_cache('plays', [
        'username' => get_bgg_sync_username(),
        'fetchedAt' => gmdate('c'),
        'plays' => $playsPayload['plays'],
        'players' => $playsPayload['players'],
    ]);

    $result = create_synced_bgg_database($games, $playsPayload['plays'], $playsPayload['players']);

    write_bgg_sync_status([
        'state' => 'complete',
        'phase' => 'complete',
        'message' => 'BGG sync completed.',
        'username' => get_bgg_sync_username(),
        'insertedGames' => $result['insertedGames'],
        'insertedPlays' => $result['insertedPlays'],
        'currentGames' => $result['insertedGames'],
        'totalGames' => $result['insertedGames'],
        'currentPlays' => $result['insertedPlays'],
        'totalPlays' => $result['insertedPlays'],
    ]);

    echo json_encode([
        'success' => true,
        'step' => 'plays',
        'username' => get_bgg_sync_username(),
        'insertedGames' => $result['insertedGames'],
        'insertedPlays' => $result['insertedPlays'],
        'backupCreated' => !empty($result['backupPath']),
        'publishDb' => true,
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $exception) {
    $code = preg_replace('/[^a-z0-9_\-]/i', '', (string)$exception->getMessage());
    if ($code === '') {
        $code = 'bgg_plays_sync_failed';
    }

    write_bgg_sync_status([
        'state' => 'error',
        'phase' => 'error',
        'message' => $code,
        'username' => get_bgg_sync_username(),
    ]);

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $code,
    ]);
}
