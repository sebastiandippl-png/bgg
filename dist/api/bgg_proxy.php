<?php
declare(strict_types=1);

require_once __DIR__ . '/bgg_api.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$bggKey = get_bgg_api_key();
if ($bggKey === '') {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'bgg_key_not_configured']);
    exit;
}

$endpoint = strtolower(trim((string)($_GET['endpoint'] ?? 'thing')));
$allowedEndpoints = ['thing', 'search', 'hot'];
if (!in_array($endpoint, $allowedEndpoints, true)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'invalid_endpoint']);
    exit;
}

$params = [];

if ($endpoint === 'thing') {
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '' || !preg_match('/^[0-9,]+$/', $id)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'invalid_id']);
        exit;
    }

    $params['id'] = $id;
    $params['stats'] = !empty($_GET['stats']) ? '1' : '0';
}

if ($endpoint === 'search') {
    $query = trim((string)($_GET['query'] ?? ''));
    if ($query === '' || strlen($query) > 100) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'invalid_query']);
        exit;
    }

    $params['query'] = $query;
    $params['type'] = 'boardgame';
    $params['exact'] = !empty($_GET['exact']) ? '1' : '0';
}

if ($endpoint === 'hot') {
    $params['type'] = 'boardgame';
}

$cacheKey = $endpoint . '|' . json_encode($params);
$cacheFile = get_bgg_cache_file($cacheKey);
$cacheTtl = 300;

if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) <= $cacheTtl) {
    $cached = @file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        header('Content-Type: application/xml; charset=utf-8');
        echo $cached;
        exit;
    }
}

$response = bgg_http_get($endpoint, $params, true);
$xml = $response['body'];
if ($response['status'] < 200 || $response['status'] >= 300 || $xml === '') {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'bgg_unavailable', 'status' => $response['status']]);
    exit;
}

@file_put_contents($cacheFile, $xml, LOCK_EX);

header('Content-Type: application/xml; charset=utf-8');
echo $xml;
