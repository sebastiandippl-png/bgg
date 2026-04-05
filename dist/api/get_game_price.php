<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const BSP_API_URL = 'https://brettspielpreise.de/api/info';
const BSP_CACHE_TTL = 24*3600; // 24 hours

function get_local_config(): array {
    $configPath = __DIR__ . '/local_config.php';
    if (!is_file($configPath) || !is_readable($configPath)) {
        return [];
    }
    $config = require $configPath;
    return is_array($config) ? $config : [];
}

function get_price_cache_dir(): string {
    $dir = __DIR__ . '/../db_storage/cache_bgg/prices';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

function get_price_cache_file(string $bggId, string $sitename): string {
    $safeBggId = preg_replace('/[^0-9]/', '', $bggId);
    $cacheKey = sha1($safeBggId . '|' . $sitename . '|EUR|DE|de|DE');
    return get_price_cache_dir() . '/' . $cacheKey . '.json';
}

try {
    $bggId = isset($_GET['bgg_id']) ? trim((string)$_GET['bgg_id']) : '';

    if ($bggId === '' || !preg_match('/^\d+$/', $bggId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'invalid_bgg_id']);
        exit;
    }

    $config = get_local_config();
    $sitename = trim((string)($config['URL_HOSTING'] ?? ''));
    if ($sitename === '') {
        $sitename = 'https://example.com';
    }

    $cacheFile = get_price_cache_file($bggId, $sitename);

    // Serve from cache if valid
    if (is_file($cacheFile) && is_readable($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (
            is_array($cached)
            && isset($cached['timestamp'])
            && (time() - (int)$cached['timestamp']) < BSP_CACHE_TTL
            && isset($cached['data'])
        ) {
            echo json_encode(['success' => true, 'price' => $cached['data'], 'cached' => true]);
            exit;
        }
    }

    $params = http_build_query([
        'eid'         => $bggId,
        'currency'    => 'EUR',
        'destination' => 'DE',
        'locale'      => 'de',
        'preferred_language' => 'DE',
        'sort'        => 'SMART',
        'sitename'    => $sitename,
    ]);

    $ctx = stream_context_create([
        'http' => [
            'method'  => 'GET',
            'timeout' => 10,
            'header'  => "Accept: application/json\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer'      => true,
            'verify_peer_name' => true,
        ],
    ]);

    $raw = @file_get_contents(BSP_API_URL . '?' . $params, false, $ctx);
    if ($raw === false || $raw === '') {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'upstream_error']);
        exit;
    }

    $responseHeaders = $http_response_header ?? [];
    $httpStatus = 0;
    if (!empty($responseHeaders) && preg_match('#\s(\d{3})\s#', (string)$responseHeaders[0], $match)) {
        $httpStatus = (int)$match[1];
    }

    if ($httpStatus !== 200) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'upstream_error', 'http_status' => $httpStatus]);
        exit;
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items']) || count($data['items']) === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'no_results']);
        exit;
    }

    $item   = $data['items'][0];
    $prices = $item['prices'] ?? [];
    if (count($prices) === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'no_prices']);
        exit;
    }

    $offer    = $prices[0];
    $currency = $data['currency'] ?? 'EUR';

    $priceData = [
        'price'    => $offer['price']   ?? null,
        'product'  => $offer['product'] ?? null,
        'currency' => $currency,
        'link'     => $item['url']      ?? null,
        'stock'    => $offer['stock']   ?? null,
        'sitename' => $offer['sitename'] ?? null,
        'item_url' => $item['url']      ?? null,
    ];

    // Write cache
    $cachePayload = ['timestamp' => time(), 'data' => $priceData];
    @file_put_contents($cacheFile, json_encode($cachePayload));

    echo json_encode(['success' => true, 'price' => $priceData, 'cached' => false]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'internal_error']);
}
