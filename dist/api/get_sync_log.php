<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/bgg_sync_log_store.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

echo json_encode([
    'success' => true,
    'log'     => read_sync_log(),
]);
