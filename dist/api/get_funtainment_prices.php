<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const FUNT_SUGGEST_BASE_URL = 'https://funtainment.de/suggest?search=';
const FUNT_CACHE_TTL = 24 * 3600; // once per day
const FUNT_MAX_RESULTS = 5;

function get_cache_dir(): string {
    $dir = __DIR__ . '/../db_storage/cache_bgg/funtainment';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

function normalize_search_name(string $gameName): string {
    $name = trim($gameName);
    if ($name === '') {
        return '';
    }

    $parts = explode(':', $name, 2);
    $normalized = trim($parts[0]);
    return $normalized !== '' ? $normalized : $name;
}

function get_cache_file(string $searchName): string {
    $normalized = function_exists('mb_strtolower')
        ? mb_strtolower($searchName, 'UTF-8')
        : strtolower($searchName);
    $key = sha1($normalized);
    return get_cache_dir() . '/' . $key . '.json';
}

function fetch_url(string $url): ?string {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 12,
            'header' => "Accept: text/html,application/xhtml+xml\r\n"
                . "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false || $raw === '') {
        return null;
    }

    $responseHeaders = $http_response_header ?? [];
    if (!empty($responseHeaders) && preg_match('#\s(\d{3})\s#', (string)$responseHeaders[0], $m)) {
        $status = (int)$m[1];
        if ($status < 200 || $status >= 300) {
            return null;
        }
    }

    return $raw;
}

function absolutize_link(string $href): string {
    if (preg_match('#^https?://#i', $href)) {
        return $href;
    }
    return 'https://funtainment.de' . (str_starts_with($href, '/') ? $href : '/' . $href);
}

function extract_top_search_products(string $searchHtml, int $maxResults = FUNT_MAX_RESULTS): array {
    $results = [];

    if (
        preg_match_all(
            '#<li[^>]*class="[^"]*search-suggest-product[^"]*js-result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"#i',
            $searchHtml,
            $matches,
            PREG_SET_ORDER
        )
    ) {
        foreach ($matches as $match) {
            if (count($results) >= $maxResults) {
                break;
            }
            $results[] = [
                'title' => html_entity_decode(trim((string)$match[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'link' => absolutize_link(trim((string)$match[1])),
            ];
        }
    }

    return $results;
}

function extract_meta_content(string $html, string $property): ?string {
    $quotedProperty = preg_quote($property, '#');
    $patternA = '#<meta\s+property="' . $quotedProperty . '"[^>]*content="([^"]*)"#i';
    $patternB = '#<meta\s+content="([^"]*)"[^>]*property="' . $quotedProperty . '"#i';

    if (preg_match($patternA, $html, $m)) {
        return trim((string)$m[1]);
    }
    if (preg_match($patternB, $html, $m)) {
        return trim((string)$m[1]);
    }

    return null;
}

function collect_offers(array $searchProducts): array {
    $offers = [];

    foreach ($searchProducts as $searchProduct) {
        $productPageHtml = fetch_url((string)$searchProduct['link']);
        if ($productPageHtml === null) {
            continue;
        }

        $amount = extract_meta_content($productPageHtml, 'product:price:amount');
        $currency = extract_meta_content($productPageHtml, 'product:price:currency') ?: 'EUR';
        $productLink = extract_meta_content($productPageHtml, 'product:product_link') ?: (string)$searchProduct['link'];
        $title = (string)($searchProduct['title'] ?? '');

        $offer = [
            'title' => $title,
            'price' => null,
            'currency' => $currency,
            'link' => $productLink,
        ];

        if ($amount !== null && is_numeric($amount)) {
            $offer['price'] = (float)$amount;
        }

        $offers[] = $offer;
    }

    return $offers;
}

try {
    $gameName = isset($_GET['game_name']) ? trim((string)$_GET['game_name']) : '';

    if ($gameName === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'invalid_game_name']);
        exit;
    }

    $searchName = normalize_search_name($gameName);
    if ($searchName === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'invalid_game_name']);
        exit;
    }

    $cacheFile = get_cache_file($searchName);
    if (is_file($cacheFile) && is_readable($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (
            is_array($cached)
            && isset($cached['timestamp'])
            && (time() - (int)$cached['timestamp']) < FUNT_CACHE_TTL
            && isset($cached['data'])
            && is_array($cached['data'])
        ) {
            echo json_encode([
                'success' => true,
                'search_name' => $searchName,
                'offers' => $cached['data'],
                'cached' => true,
            ]);
            exit;
        }
    }

    $suggestHtml = fetch_url(FUNT_SUGGEST_BASE_URL . urlencode($searchName));
    if ($suggestHtml === null) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => 'suggest_fetch_failed']);
        exit;
    }

    $searchProducts = extract_top_search_products($suggestHtml, FUNT_MAX_RESULTS);
    if (count($searchProducts) === 0) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'no_results',
            'search_name' => $searchName,
            'offers' => [],
        ]);
        exit;
    }

    $offers = collect_offers($searchProducts);
    $cachePayload = [
        'timestamp' => time(),
        'data' => $offers,
    ];
    @file_put_contents($cacheFile, json_encode($cachePayload));

    echo json_encode([
        'success' => true,
        'search_name' => $searchName,
        'offers' => $offers,
        'cached' => false,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'internal_error']);
}
