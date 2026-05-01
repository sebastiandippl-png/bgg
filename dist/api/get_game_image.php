<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

require_once __DIR__ . '/bgg_api.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: max-age=86400');
header('Access-Control-Allow-Origin: *');

function normalize_bgg_image_url(string $url): string {
    $normalized = trim($url);
    if ($normalized === '') {
        return '';
    }

    if (strpos($normalized, 'http://') === 0) {
        return 'https://' . substr($normalized, 7);
    }

    return $normalized;
}

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
            $cachedUrl = normalize_bgg_image_url((string)$cachedData['urlThumb']);
            http_response_code(200);
            echo json_encode(['success' => true, 'urlThumb' => $cachedUrl]);
            exit;
        }
    }

    // Fetch from BGG API with short retries for temporary upstream states.
    $response = ['status' => 0, 'body' => ''];
    $maxAttempts = 3;
    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        $response = bgg_http_get('thing', ['id' => $gameId]);
        if ($response['status'] === 200) {
            break;
        }

        $shouldRetry = in_array($response['status'], [202, 429, 503], true);
        if (!$shouldRetry || $attempt === $maxAttempts) {
            break;
        }

        sleep($attempt);
    }

    if ($response['status'] === 401) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'bgg_unauthorized', 'http_status' => 401]);
        exit;
    }

    if (trim((string)$response['body']) === '' && $response['status'] !== 200) {
        $httpStatus = $response['status'] === 404 ? 404 : 502;
        http_response_code($httpStatus);
        echo json_encode(['success' => false, 'error' => $httpStatus === 404 ? 'game_not_found' : 'bgg_unavailable', 'http_status' => $response['status']]);
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
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'game_not_found', 'http_status' => $response['status']]);
        exit;
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

    $urlThumb = normalize_bgg_image_url($urlThumb);

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

