<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

require_once __DIR__ . '/bgg_api.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: max-age=86400');
header('Access-Control-Allow-Origin: *');

try {
    // Get game ID from query parameter
    $gameId = isset($_GET['id']) ? trim((string)$_GET['id']) : '';

    if ($gameId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'missing_game_id']);
        exit;
    }

    // Validate game ID is numeric
    if (!preg_match('/^\d+$/', $gameId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'invalid_game_id']);
        exit;
    }

    // Try to fetch from cache first
    $cacheKey = 'game_image_' . $gameId;
    $cacheFile = get_bgg_cache_file($cacheKey);

    if (is_file($cacheFile) && is_readable($cacheFile)) {
        $cachedData = json_decode(file_get_contents($cacheFile), true);
        if (is_array($cachedData) && isset($cachedData['urlThumb'])) {
            http_response_code(200);
            echo json_encode(['success' => true, 'urlThumb' => $cachedData['urlThumb']]);
            exit;
        }
    }

    // Fetch from BGG API
    $response = bgg_http_get('thing', ['id' => $gameId, 'type' => 'boardgame'], false);

    if ($response['status'] !== 200) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'game_not_found', 'http_status' => $response['status']]);
        exit;
    }

    // Parse XML response
    $xml = simplexml_load_string($response['body']);
    if ($xml === false) {
        throw new Exception('Invalid XML');
    }

    // Extract thumbnail URL
    $items = $xml->xpath('//item');
    if (empty($items)) {
        throw new Exception('No item found');
    }

    $item = $items[0];
    $thumbnails = $item->xpath('thumbnail/text()');
    
    if (empty($thumbnails)) {
        // Try image as fallback
        $images = $item->xpath('image/text()');
        if (empty($images)) {
            throw new Exception('No image found');
        }
        $urlThumb = (string)$images[0];
    } else {
        $urlThumb = (string)$thumbnails[0];
    }

    if ($urlThumb === '') {
        throw new Exception('Empty image URL');
    }

    // Cache the result
    @mkdir(get_bgg_cache_dir(), 0750, true);
    file_put_contents($cacheFile, json_encode(['urlThumb' => $urlThumb]));

    http_response_code(200);
    echo json_encode(['success' => true, 'urlThumb' => $urlThumb]);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'parse_failed', 'message' => $e->getMessage()]);
    exit;
}

