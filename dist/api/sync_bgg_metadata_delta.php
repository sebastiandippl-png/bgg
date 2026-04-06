<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/bgg_sync_service.php';
require_once __DIR__ . '/bgg_sync_status_store.php';
require_once __DIR__ . '/bgg_sync_log_store.php';

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

if (is_sync_running()) {
    http_response_code(409);
    echo json_encode(['success' => false, 'error' => 'sync_already_running']);
    exit;
}

$syncStartedAt = gmdate('c');

if (function_exists('set_time_limit')) {
    @set_time_limit(0);
}

write_bgg_sync_status([
    'state' => 'queued',
    'phase' => 'queued',
    'message' => 'Game metadata delta sync queued.',
    'username' => get_bgg_sync_username(),
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

    $bggIdsWithoutMetadata = get_bgg_ids_without_metadata();

    if ($bggIdsWithoutMetadata === []) {
        write_bgg_sync_status([
            'state' => 'complete',
            'phase' => 'metadata_delta_complete',
            'message' => 'All games already have metadata. Nothing to sync.',
            'username' => get_bgg_sync_username(),
            'updatedGames' => 0,
            'currentGames' => 0,
            'totalGames' => 0,
            'currentPlays' => 0,
            'totalPlays' => 0,
        ]);

        append_sync_log_entry('metadata_delta', $syncStartedAt, gmdate('c'), true, [
            'updatedGames' => 0,
        ]);

        echo json_encode([
            'success' => true,
            'step' => 'metadata_delta',
            'username' => get_bgg_sync_username(),
            'updatedGames' => 0,
            'publishDb' => false,
            'syncedAt' => gmdate('c'),
        ]);
        exit;
    }

    write_bgg_sync_status([
        'state' => 'polling',
        'phase' => 'details_fetch',
        'message' => 'Fetching metadata for ' . count($bggIdsWithoutMetadata) . ' games without metadata...',
        'username' => get_bgg_sync_username(),
        'currentGames' => 0,
        'totalGames' => count($bggIdsWithoutMetadata),
        'currentPlays' => 0,
        'totalPlays' => 0,
    ]);

    $result = apply_metadata_delta_to_database($games, $bggIdsWithoutMetadata);

    write_bgg_sync_status([
        'state' => 'complete',
        'phase' => 'metadata_delta_complete',
        'message' => 'Metadata delta sync complete. Updated ' . $result['updatedGames'] . ' games.',
        'username' => get_bgg_sync_username(),
        'updatedGames' => $result['updatedGames'],
        'currentGames' => $result['updatedGames'],
        'totalGames' => count($bggIdsWithoutMetadata),
        'currentPlays' => 0,
        'totalPlays' => 0,
    ]);

    append_sync_log_entry('metadata_delta', $syncStartedAt, gmdate('c'), true, [
        'updatedGames' => $result['updatedGames'],
    ]);

    echo json_encode([
        'success' => true,
        'step' => 'metadata_delta',
        'username' => get_bgg_sync_username(),
        'updatedGames' => $result['updatedGames'],
        'publishDb' => true,
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $exception) {
    $code = preg_replace('/[^a-z0-9_\-]/i', '', (string)$exception->getMessage());
    if ($code === '') {
        $code = 'bgg_metadata_delta_sync_failed';
    }

    write_bgg_sync_status([
        'state' => 'error',
        'phase' => 'error',
        'message' => $code,
        'username' => get_bgg_sync_username(),
    ]);

    append_sync_log_entry('metadata_delta', $syncStartedAt, gmdate('c'), false, [
        'error' => $code,
    ]);

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $code,
    ]);
}
