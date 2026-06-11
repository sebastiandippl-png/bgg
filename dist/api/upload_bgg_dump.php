<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const BGG_DUMP_MAX_BYTES = 30 * 1024 * 1024; // 30 MB
const BGG_DUMP_INPUT_KEY = 'dump_csv';
const BGG_DUMP_TARGET_FILE = 'bgg_dump_latest.csv';
const BGG_TOP_GAMES_CACHE_FILE = 'bgg_top_games_cache.json';

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
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

if (!isset($_FILES[BGG_DUMP_INPUT_KEY]) || !is_array($_FILES[BGG_DUMP_INPUT_KEY])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'missing_file']);
    exit;
}

$file = $_FILES[BGG_DUMP_INPUT_KEY];
$errorCode = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
if ($errorCode !== UPLOAD_ERR_OK) {
    $errorMap = [
        UPLOAD_ERR_INI_SIZE => 'file_too_large',
        UPLOAD_ERR_FORM_SIZE => 'file_too_large',
        UPLOAD_ERR_PARTIAL => 'upload_partial',
        UPLOAD_ERR_NO_FILE => 'missing_file',
        UPLOAD_ERR_NO_TMP_DIR => 'server_temp_dir_missing',
        UPLOAD_ERR_CANT_WRITE => 'server_write_failed',
        UPLOAD_ERR_EXTENSION => 'upload_blocked',
    ];

    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $errorMap[$errorCode] ?? 'upload_failed',
    ]);
    exit;
}

$originalName = trim((string)($file['name'] ?? ''));
if ($originalName === '' || !preg_match('/\.csv$/i', $originalName)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'invalid_file_type']);
    exit;
}

$size = (int)($file['size'] ?? 0);
if ($size <= 0 || $size > BGG_DUMP_MAX_BYTES) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'file_too_large']);
    exit;
}

$tmpPath = (string)($file['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'invalid_upload']);
    exit;
}

$storageDir = __DIR__ . '/../db_storage';
if (!is_dir($storageDir) && !@mkdir($storageDir, 0750, true)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'storage_unavailable']);
    exit;
}

$tempTarget = $storageDir . '/bgg_dump_upload_' . str_replace('.', '', uniqid('', true)) . '.tmp';
$finalTarget = $storageDir . '/' . BGG_DUMP_TARGET_FILE;

if (!@move_uploaded_file($tmpPath, $tempTarget)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'store_failed']);
    exit;
}

if (!@rename($tempTarget, $finalTarget)) {
    @unlink($tempTarget);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'store_failed']);
    exit;
}

@chmod($finalTarget, 0640);

$cachePath = $storageDir . '/' . BGG_TOP_GAMES_CACHE_FILE;
if (is_file($cachePath)) {
    @unlink($cachePath);
}

echo json_encode([
    'success' => true,
    'fileName' => BGG_DUMP_TARGET_FILE,
    'bytes' => filesize($finalTarget),
    'uploadedAt' => gmdate('c'),
]);
