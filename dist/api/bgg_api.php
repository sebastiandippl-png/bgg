<?php
declare(strict_types=1);

/**
 * BGG API helper functions.
 */

const BGG_BASE_URL = 'https://boardgamegeek.com/xmlapi2/';
const BGG_KEY_ENV = 'BGSTATS_BGG_API_KEY';

/**
 * Return API key from local config file if present.
 */
function get_bgg_api_key_from_local_config(): string {
    $configPath = __DIR__ . '/local_config.php';
    if (!is_file($configPath) || !is_readable($configPath)) {
        return '';
    }

    $config = require $configPath;
    if (!is_array($config)) {
        return '';
    }

    $value = $config['BGSTATS_BGG_API_KEY'] ?? '';
    return trim((string)$value);
}

/**
 * Return configured BGG API token from environment or local config file.
 */
function get_bgg_api_key(): string {
    $key = trim((string)(getenv(BGG_KEY_ENV) ?: ''));
    if ($key === '') {
        $key = get_bgg_api_key_from_local_config();
    }

    if ($key === '' || strlen($key) > 256) {
        return '';
    }

    return $key;
}

/**
 * Return a cache directory path and ensure it exists.
 */
function get_bgg_cache_dir(): string {
    $dir = __DIR__ . '/../db_storage/cache_bgg';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }

    return $dir;
}

/**
 * Build a deterministic cache file path for a request key.
 */
function get_bgg_cache_file(string $cacheKey): string {
    return rtrim(get_bgg_cache_dir(), '/\\') . '/' . sha1($cacheKey) . '.xml';
}

/**
 * Execute a BGG GET request and return status code + body.
 * When enabled, sends token as Authorization: Bearer <token>.
 *
 * @return array{status:int, body:string}
 */
function bgg_http_get(string $endpoint, array $params = [], bool $includeApiKey = true): array {
    $safeEndpoint = trim($endpoint, "/ ");
    if ($safeEndpoint === '' || !preg_match('/^[a-z0-9_]+$/i', $safeEndpoint)) {
        return ['status' => 400, 'body' => ''];
    }

    $query = $params;
    $key = get_bgg_api_key();
    $headers = ["Accept: application/xml"];
    if ($includeApiKey && $key !== '') {
        $headers[] = 'Authorization: Bearer ' . $key;
    }

    $url = BGG_BASE_URL . $safeEndpoint;
    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 15,
            'header' => implode("\r\n", $headers) . "\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $ctx);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    if (!empty($responseHeaders) && preg_match('#\s(\d{3})\s#', (string)$responseHeaders[0], $match)) {
        $status = (int)$match[1];
    }

    if ($body === false) {
        $body = '';
    }

    return ['status' => $status, 'body' => $body];
}
