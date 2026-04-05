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
    'message' => 'New games sync queued.',
    'username' => get_bgg_sync_username(),
    'currentGames' => 0,
    'totalGames' => null,
    'currentPlays' => 0,
    'totalPlays' => 0,
]);

try {
    $games = fetch_owned_games_from_bgg(get_bgg_sync_username());

    write_bgg_sync_cache('games', [
        'username' => get_bgg_sync_username(),
        'fetchedAt' => gmdate('c'),
        'games' => $games,
    ]);

    $result = append_new_games_to_existing_database($games);

    write_bgg_sync_status([
        'state' => 'complete',
        'phase' => 'new_games_complete',
        'message' => 'New games sync complete. Inserted ' . $result['insertedGames'] . ' new games and removed ' . $result['removedGames'] . ' games no longer in collection.',
        'username' => get_bgg_sync_username(),
        'fetchedGames' => $result['fetchedGames'],
        'newGames' => $result['newGames'],
        'insertedGames' => $result['insertedGames'],
        'removedGames' => $result['removedGames'],
        'currentGames' => $result['newGames'],
        'totalGames' => $result['newGames'],
        'currentPlays' => 0,
        'totalPlays' => 0,
    ]);

    echo json_encode([
        'success' => true,
        'step' => 'new_games',
        'username' => get_bgg_sync_username(),
        'fetchedGames' => $result['fetchedGames'],
        'newGames' => $result['newGames'],
        'insertedGames' => $result['insertedGames'],
        'removedGames' => $result['removedGames'],
        'publishDb' => true,
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $exception) {
    $code = preg_replace('/[^a-z0-9_\-]/i', '', (string)$exception->getMessage());
    if ($code === '') {
        $code = 'bgg_new_games_sync_failed';
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
