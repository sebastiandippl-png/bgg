<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const BGG_TOP_GAMES_DUMP_FILE = __DIR__ . '/../db_storage/bgg_dump_latest.csv';
const BGG_TOP_GAMES_CACHE_FILE = __DIR__ . '/../db_storage/bgg_top_games_cache.json';
const BGG_TOP_GAMES_YEAR_WINDOW = 10;

$requestedWith = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));
if ($requestedWith !== 'xmlhttprequest') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'invalid_request']);
    exit;
}

$csvPath = BGG_TOP_GAMES_DUMP_FILE;
if (!is_file($csvPath) || !is_readable($csvPath)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'dump_not_found']);
    exit;
}

$dumpMtime = @filemtime($csvPath);
$dumpSize = @filesize($csvPath);
if ($dumpMtime === false || $dumpSize === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'dump_stat_failed']);
    exit;
}

$currentYear = (int)gmdate('Y');
$targetYears = [];
for ($offset = 0; $offset <= BGG_TOP_GAMES_YEAR_WINDOW; $offset++) {
    $targetYears[] = $currentYear - $offset;
}

$cachedPayload = null;
if (is_file(BGG_TOP_GAMES_CACHE_FILE) && is_readable(BGG_TOP_GAMES_CACHE_FILE)) {
    $cacheRaw = @file_get_contents(BGG_TOP_GAMES_CACHE_FILE);
    if (is_string($cacheRaw) && $cacheRaw !== '') {
        $cacheData = json_decode($cacheRaw, true);
        if (
            is_array($cacheData)
            && isset($cacheData['dumpMtime'], $cacheData['dumpSize'], $cacheData['payload'])
            && (int)$cacheData['dumpMtime'] === (int)$dumpMtime
            && (int)$cacheData['dumpSize'] === (int)$dumpSize
            && is_array($cacheData['payload'])
        ) {
            $cachedPayload = $cacheData['payload'];
        }
    }
}

if ($cachedPayload !== null) {
    $cachedPayload['cached'] = true;
    echo json_encode($cachedPayload);
    exit;
}

$handle = @fopen($csvPath, 'rb');
if ($handle === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'dump_open_failed']);
    exit;
}

$header = fgetcsv($handle, 0, ',', '"', '\\');
if (!is_array($header) || count($header) === 0) {
    fclose($handle);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'invalid_dump_header']);
    exit;
}

$columnIndex = [];
foreach ($header as $idx => $name) {
    $columnIndex[strtolower(trim((string)$name))] = (int)$idx;
}

$required = ['id', 'name', 'yearpublished', 'rank', 'bayesaverage'];
foreach ($required as $columnName) {
    if (!array_key_exists($columnName, $columnIndex)) {
        fclose($handle);
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'invalid_dump_header']);
        exit;
    }
}

$gamesByYear = [];
foreach ($targetYears as $year) {
    $gamesByYear[$year] = [];
}

while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
    if (!is_array($row) || count($row) === 0) {
        continue;
    }

    $yearRaw = trim((string)($row[$columnIndex['yearpublished']] ?? ''));
    $rankRaw = trim((string)($row[$columnIndex['rank']] ?? ''));
    $bayesRaw = trim((string)($row[$columnIndex['bayesaverage']] ?? ''));
    $idRaw = trim((string)($row[$columnIndex['id']] ?? ''));
    $nameRaw = trim((string)($row[$columnIndex['name']] ?? ''));

    if ($yearRaw === '' || $rankRaw === '' || $bayesRaw === '' || $idRaw === '' || $nameRaw === '') {
        continue;
    }

    if (!ctype_digit($yearRaw) || !ctype_digit($rankRaw) || !ctype_digit($idRaw) || !is_numeric($bayesRaw)) {
        continue;
    }

    $year = (int)$yearRaw;
    $rank = (int)$rankRaw;
    $bggId = (int)$idRaw;
    $geekRating = (float)$bayesRaw;

    if (!isset($gamesByYear[$year]) || $rank <= 0 || $bggId <= 0 || !is_finite($geekRating)) {
        continue;
    }

    $gamesByYear[$year][] = [
        'id' => $bggId,
        'name' => $nameRaw,
        'yearpublished' => $year,
        'rank' => $rank,
        'geek_rating' => $geekRating,
    ];
}

fclose($handle);

$years = [];
foreach ($targetYears as $year) {
    $bucket = $gamesByYear[$year] ?? [];
    usort($bucket, static function (array $left, array $right): int {
        if ($left['rank'] === $right['rank']) {
            return strcmp((string)$left['name'], (string)$right['name']);
        }
        return $left['rank'] <=> $right['rank'];
    });

    $topGames = array_slice($bucket, 0, 10);
    $years[] = [
        'year' => $year,
        'count' => count($topGames),
        'games' => $topGames,
    ];
}

$currentYearGames = $years[0]['games'] ?? [];
$computedAt = gmdate('c');

$responsePayload = [
    'success' => true,
    'year' => $currentYear,
    'count' => count($currentYearGames),
    'games' => $currentYearGames,
    'years' => $years,
    'cached' => false,
    'computedAt' => $computedAt,
];

@file_put_contents(
    BGG_TOP_GAMES_CACHE_FILE,
    json_encode([
        'dumpMtime' => (int)$dumpMtime,
        'dumpSize' => (int)$dumpSize,
        'payload' => $responsePayload,
    ]),
    LOCK_EX
);

echo json_encode($responsePayload);
