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

$lookbackDays = 7;
$minDate = gmdate('Y-m-d', strtotime('-' . $lookbackDays . ' days'));

write_bgg_sync_status([
    'state' => 'queued',
    'phase' => 'queued',
    'message' => 'Last-week plays sync queued.',
    'username' => get_bgg_sync_username(),
    'currentGames' => 0,
    'totalGames' => 0,
    'currentPlays' => 0,
    'totalPlays' => null,
]);

try {
    $playsPayload = fetch_plays_from_bgg(get_bgg_sync_username(), 0, $minDate);

    write_bgg_sync_cache('plays_last_week', [
        'username' => get_bgg_sync_username(),
        'fetchedAt' => gmdate('c'),
        'minDate' => $minDate,
        'plays' => $playsPayload['plays'],
        'players' => $playsPayload['players'],
    ]);

    $result = append_recent_plays_to_existing_database($playsPayload['plays'], $playsPayload['players']);

    write_bgg_sync_status([
        'state' => 'complete',
        'phase' => 'complete',
        'message' => 'Last-week plays sync completed.',
        'username' => get_bgg_sync_username(),
        'insertedGames' => 0,
        'insertedPlays' => $result['insertedPlays'],
        'fetchedPlays' => $result['fetchedPlays'],
        'currentGames' => 0,
        'totalGames' => 0,
        'currentPlays' => $result['insertedPlays'],
        'totalPlays' => $result['fetchedPlays'],
    ]);

    append_sync_log_entry('last_plays', $syncStartedAt, gmdate('c'), true, [
        'insertedPlays' => $result['insertedPlays'],
        'fetchedPlays'  => $result['fetchedPlays'],
    ]);

    echo json_encode([
        'success' => true,
        'step' => 'last_week_plays',
        'username' => get_bgg_sync_username(),
        'lookbackDays' => $lookbackDays,
        'minDate' => $minDate,
        'insertedGames' => 0,
        'insertedPlays' => $result['insertedPlays'],
        'fetchedPlays' => $result['fetchedPlays'],
        'publishDb' => true,
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $exception) {
    $code = preg_replace('/[^a-z0-9_\-]/i', '', (string)$exception->getMessage());
    if ($code === '') {
        $code = 'bgg_last_week_plays_sync_failed';
    }

    write_bgg_sync_status([
        'state' => 'error',
        'phase' => 'error',
        'message' => $code,
        'username' => get_bgg_sync_username(),
    ]);

    append_sync_log_entry('last_plays', $syncStartedAt, gmdate('c'), false, [
        'error' => $code,
    ]);

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $code,
    ]);
}
