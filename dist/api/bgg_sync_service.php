<?php
declare(strict_types=1);

require_once __DIR__ . '/bgg_api.php';
require_once __DIR__ . '/bgg_sync_status_store.php';

const BGG_SYNC_USERNAME = 'sebbes';
const BGG_MAX_POLL_ATTEMPTS = 15;
const BGG_PLAYS_PER_PAGE = 100;
const BGG_THING_BATCH_SIZE = 20;
const BGG_THING_REQUEST_INTERVAL_SECONDS = 2.5;

function write_sync_progress(array $payload): void {
    write_bgg_sync_status($payload);
}

function ensure_bgg_sync_dependencies(): void {
    if (!function_exists('simplexml_load_string')) {
        throw new RuntimeException('simplexml_missing');
    }

    if (!class_exists('SQLite3')) {
        throw new RuntimeException('sqlite3_missing');
    }
}

function sanitize_bgg_username(string $username): string {
    $username = trim($username);
    if ($username === '') {
        throw new RuntimeException('invalid_username');
    }

    return $username;
}

function get_bgg_sync_cache_dir(): string {
    $dir = __DIR__ . '/../db_storage/sync_cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }

    return $dir;
}

function get_bgg_sync_cache_file(string $name): string {
    $safe = preg_replace('/[^a-z0-9_\-]/i', '', $name);
    if ($safe === '') {
        throw new RuntimeException('invalid_cache_name');
    }

    return rtrim(get_bgg_sync_cache_dir(), '/\\') . '/' . $safe . '.json';
}

function write_bgg_sync_cache(string $name, array $payload): void {
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('sync_cache_encode_failed');
    }

    $result = @file_put_contents(get_bgg_sync_cache_file($name), $json, LOCK_EX);
    if ($result === false) {
        throw new RuntimeException('sync_cache_write_failed');
    }
}

function read_bgg_sync_cache(string $name): array {
    $path = get_bgg_sync_cache_file($name);
    if (!is_file($path)) {
        throw new RuntimeException('sync_cache_missing_' . $name);
    }

    $raw = (string)@file_get_contents($path);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('sync_cache_invalid_' . $name);
    }

    return $decoded;
}

function throttle_bgg_thing_requests(string $endpoint): void {
    static $lastThingRequestAt = 0.0;
    if ($endpoint !== 'thing') {
        return;
    }

    $now = microtime(true);
    $elapsed = $now - $lastThingRequestAt;
    if ($elapsed < BGG_THING_REQUEST_INTERVAL_SECONDS) {
        $sleepMicros = (int)round((BGG_THING_REQUEST_INTERVAL_SECONDS - $elapsed) * 1000000);
        if ($sleepMicros > 0) {
            usleep($sleepMicros);
        }
    }

    $lastThingRequestAt = microtime(true);
}

function request_bgg_xml_with_polling(string $endpoint, array $params, string $pendingMessage, string $timeoutCode, array $statusMeta = [], bool $includeApiKey = true): SimpleXMLElement {
    $xmlString = '';
    $triedWithApiKey = $includeApiKey;
    $triedWithoutApiKey = !$includeApiKey;

    for ($attempt = 1; $attempt <= BGG_MAX_POLL_ATTEMPTS; $attempt += 1) {
        write_sync_progress(array_merge([
            'state' => 'polling',
            'attempt' => $attempt,
            'message' => $pendingMessage,
        ], $statusMeta));

        throttle_bgg_thing_requests($endpoint);
        $response = bgg_http_get($endpoint, $params, $includeApiKey);
        if ($response['status'] === 202 || $response['status'] === 429) {
            sleep(2);
            continue;
        }

        if ($response['status'] === 0 || $response['status'] === 500 || $response['status'] === 503) {
            usleep((int)round(BGG_THING_REQUEST_INTERVAL_SECONDS * 1000000));
            continue;
        }

        if ($response['status'] === 401 || $response['status'] === 403) {
            if (!$triedWithoutApiKey) {
                $includeApiKey = false;
                $triedWithoutApiKey = true;
                continue;
            }

            if (!$triedWithApiKey) {
                $includeApiKey = true;
                $triedWithApiKey = true;
                continue;
            }

            throw new RuntimeException('bgg_xmlapi_bearer_auth_required');
        }

        if ($response['status'] < 200 || $response['status'] >= 300 || trim($response['body']) === '') {
            throw new RuntimeException('bgg_' . $endpoint . '_unavailable_status_' . (int)$response['status']);
        }

        $xmlString = $response['body'];
        break;
    }

    if ($xmlString === '') {
        throw new RuntimeException($timeoutCode);
    }

    $xml = @simplexml_load_string($xmlString, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    if (!$xml) {
        throw new RuntimeException('invalid_bgg_xml');
    }

    return $xml;
}

/**
 * @return array<int, array<string, mixed>>
 */
function fetch_owned_games_from_bgg(string $username): array {
    ensure_bgg_sync_dependencies();
    $username = sanitize_bgg_username($username);

    $baseXml = request_bgg_xml_with_polling(
        'collection',
        [
            'username' => $username,
            'stats' => '1',
            'excludesubtype' => 'boardgameexpansion',
        ],
        'Waiting for BGG collection export (base games)...',
        'bgg_collection_timeout',
        [
            'phase' => 'collection_wait_base',
            'currentGames' => 0,
            'totalGames' => null,
            'currentPlays' => 0,
            'totalPlays' => null,
        ]
    );

    $expansionXml = request_bgg_xml_with_polling(
        'collection',
        [
            'username' => $username,
            'stats' => '1',
            'subtype' => 'boardgameexpansion',
        ],
        'Waiting for BGG collection export (expansions)...',
        'bgg_collection_timeout',
        [
            'phase' => 'collection_wait_expansions',
            'currentGames' => 0,
            'totalGames' => null,
            'currentPlays' => 0,
            'totalPlays' => null,
        ]
    );

    $gamesByBggId = [];
    foreach ([$baseXml, $expansionXml] as $xml) {
        foreach ($xml->item as $item) {
            $statusOwn = (string)($item->status['own'] ?? '0');
            $isOwned = $statusOwn === '1';

            $bggId = (int)($item['objectid'] ?? 0);
            if ($bggId <= 0) {
                continue;
            }

            $name = trim((string)($item->name ?? ''));
            if ($name === '') {
                $name = 'Unknown Game';
            }

            $thumbnail = trim((string)($item->thumbnail ?? ''));
            $image = trim((string)($item->image ?? ''));
            $subtype = strtolower(trim((string)($item['subtype'] ?? 'boardgame')));
            $yearPublishedRaw = (string)($item->yearpublished ?? '');
            $yearPublished = ctype_digit($yearPublishedRaw) ? (int)$yearPublishedRaw : null;
            $numPlaysRaw = (string)($item->numplays ?? '0');
            $numPlays = ctype_digit($numPlaysRaw) ? (int)$numPlaysRaw : 0;
            $minPlayersRaw = (string)($item->stats['minplayers'] ?? '');
            $maxPlayersRaw = (string)($item->stats['maxplayers'] ?? '');
            $minPlayTimeRaw = (string)($item->stats['minplaytime'] ?? '');
            $maxPlayTimeRaw = (string)($item->stats['maxplaytime'] ?? '');
            $minPlayers = ctype_digit($minPlayersRaw) ? (int)$minPlayersRaw : 0;
            $maxPlayers = ctype_digit($maxPlayersRaw) ? (int)$maxPlayersRaw : 0;
            $minPlayTime = ctype_digit($minPlayTimeRaw) ? (int)$minPlayTimeRaw : 0;
            $maxPlayTime = ctype_digit($maxPlayTimeRaw) ? (int)$maxPlayTimeRaw : 0;
            $ratingValue = (string)($item->stats->rating['value'] ?? '');
            $rating = is_numeric($ratingValue) ? (float)$ratingValue : null;
            $bggRatingValue = (string)($item->stats->rating->average['value'] ?? '');
            $bggRating = is_numeric($bggRatingValue) ? (float)$bggRatingValue : null;
            $weightValue = (string)($item->stats->rating->averageweight['value'] ?? '');
            $weight = is_numeric($weightValue) ? (float)$weightValue : null;
            $lastModifiedRaw = trim((string)($item->status['lastmodified'] ?? ''));
            $bggLastModified = $lastModifiedRaw !== '' ? $lastModifiedRaw : null;

            $raw = [
                'bggId' => $bggId,
                'name' => $name,
                'subtype' => $subtype,
                'yearPublished' => $yearPublished,
                'thumbnail' => $thumbnail,
                'image' => $image,
                'numPlays' => $numPlays,
                'minPlayerCount' => $minPlayers,
                'maxPlayerCount' => $maxPlayers,
                'minPlayTime' => $minPlayTime,
                'maxPlayTime' => $maxPlayTime,
                'rating' => $rating,
                'bggRating' => $bggRating,
                'weight' => $weight,
                'bgg_lastmodified' => $bggLastModified,
                'statusOwn' => $isOwned,
                'username' => $username,
            ];

            $gamesByBggId[$bggId] = [
                'id' => 'bgg_' . $bggId,
                'name' => $name,
                'bggId' => $bggId,
                'isExpansion' => $subtype === 'boardgameexpansion' ? 1 : 0,
                'isBaseGame' => $subtype === 'boardgameexpansion' ? 0 : 1,
                'bggYear' => $yearPublished,
                'numPlays' => $numPlays,
                'minPlayerCount' => $minPlayers,
                'maxPlayerCount' => $maxPlayers,
                'minPlayTime' => $minPlayTime,
                'maxPlayTime' => $maxPlayTime,
                'rating' => $rating,
                'bggRating' => $bggRating,
                'weight' => $weight,
                'bgg_lastmodified' => $bggLastModified,
                'owned' => $isOwned ? 1 : 0,
                'thumbnail' => $thumbnail,
                'image' => $image,
                'rawJson' => json_encode($raw, JSON_UNESCAPED_SLASHES),
            ];
        }
    }

    $games = array_values($gamesByBggId);

    write_sync_progress([
        'state' => 'polling',
        'phase' => 'collection_ready',
        'message' => 'Fetched ' . count($games) . ' collection games from BGG.',
        'currentGames' => count($games),
        'totalGames' => count($games),
        'currentPlays' => 0,
        'totalPlays' => null,
    ]);

    return $games;
}

function parse_bgg_int_value(SimpleXMLElement $item, string $fieldName): ?int {
    $raw = trim((string)($item->{$fieldName}['value'] ?? $item->{$fieldName} ?? ''));
    return ctype_digit($raw) ? (int)$raw : null;
}

function extract_player_count_numbers(string $value): ?string {
    if (preg_match('/(\d+\s*[–\-]\s*\d+|\d+)/u', $value, $matches)) {
        return preg_replace('/\s*[–\-]\s*/u', '-', $matches[1]);
    }
    return null;
}

/**
 * @return array{best_with: string|null, recommended_with: string|null}
 */
function parse_best_with_summary(SimpleXMLElement $item): array {
    $bestWith = null;
    $recommendedWith = null;

    foreach ($item->{'poll-summary'} as $pollSummary) {
        $pollName = strtolower(trim((string)($pollSummary['name'] ?? '')));
        if ($pollName !== 'suggested_numplayers') {
            continue;
        }

        foreach ($pollSummary->result as $resultNode) {
            $name = strtolower(trim((string)($resultNode['name'] ?? '')));
            $value = trim((string)($resultNode['value'] ?? ''));
            if ($value === '') {
                continue;
            }

            $numbers = extract_player_count_numbers($value);
            if ($name === 'bestwith') {
                $bestWith = $numbers;
            } elseif ($name === 'recommmendedwith') {
                $recommendedWith = $numbers;
            }
        }
    }

    return ['best_with' => $bestWith, 'recommended_with' => $recommendedWith];
}

/**
 * @return string|null
 */
function parse_designers(SimpleXMLElement $item): ?string {
    $designers = [];

    foreach ($item->link as $link) {
        $type = strtolower(trim((string)($link['type'] ?? '')));
        if ($type === 'boardgamedesigner') {
            $value = trim((string)($link['value'] ?? ''));
            if ($value !== '') {
                $designers[] = $value;
            }
        }
    }

    $designerString = null;
    if (!empty($designers)) {
        $designerString = implode(', ', $designers);
    }

    return $designerString;
}

/**
 * @param array<int, array<string, mixed>> $games
 * @param array<int, int> $gamesByBggId
 */
function apply_bgg_thing_details_to_games(array &$games, array $gamesByBggId, SimpleXMLElement $xml): void {
    foreach ($xml->item as $item) {
        $bggId = (int)($item['id'] ?? 0);
        if ($bggId <= 0 || !array_key_exists($bggId, $gamesByBggId)) {
            continue;
        }

        $gameIndex = $gamesByBggId[$bggId];
        $games[$gameIndex]['minPlayerCount'] = parse_bgg_int_value($item, 'minplayers');
        $games[$gameIndex]['maxPlayerCount'] = parse_bgg_int_value($item, 'maxplayers');
        $games[$gameIndex]['minPlayTime'] = parse_bgg_int_value($item, 'minplaytime');
        $games[$gameIndex]['maxPlayTime'] = parse_bgg_int_value($item, 'maxplaytime');
        $bestWithSummary = parse_best_with_summary($item);
        $games[$gameIndex]['best_with'] = $bestWithSummary['best_with'];
        $games[$gameIndex]['recommended_with'] = $bestWithSummary['recommended_with'];

        $games[$gameIndex]['designer'] = parse_designers($item);

        // Thing endpoint stats live under statistics/ratings.
        $ratingsNode = $item->statistics->ratings ?? null;
        if ($ratingsNode instanceof SimpleXMLElement) {
            $averageRatingValue = (string)($ratingsNode->average['value'] ?? '');
            $bayesRatingValue = (string)($ratingsNode->bayesaverage['value'] ?? '');
            $averageWeightValue = (string)($ratingsNode->averageweight['value'] ?? '');

            $averageRating = is_numeric($averageRatingValue) ? (float)$averageRatingValue : null;
            $bggRating = is_numeric($bayesRatingValue) ? (float)$bayesRatingValue : null;
            $weight = is_numeric($averageWeightValue) ? (float)$averageWeightValue : null;

            // Use consistent snake_case naming for database fields
            $games[$gameIndex]['average_rating'] = $averageRating;
            $games[$gameIndex]['bgg_rating'] = $bggRating;
            $games[$gameIndex]['weight'] = $weight;
        }

        $type = strtolower(trim((string)($item['type'] ?? '')));
        if ($type !== '') {
            $games[$gameIndex]['isExpansion'] = $type === 'boardgameexpansion' ? 1 : 0;
            $games[$gameIndex]['isBaseGame'] = $type === 'boardgameexpansion' ? 0 : 1;
        }

        $raw = json_decode((string)$games[$gameIndex]['rawJson'], true);
        if (is_array($raw)) {
            $raw['minPlayerCount'] = $games[$gameIndex]['minPlayerCount'];
            $raw['maxPlayerCount'] = $games[$gameIndex]['maxPlayerCount'];
            $raw['minPlayTime'] = $games[$gameIndex]['minPlayTime'];
            $raw['maxPlayTime'] = $games[$gameIndex]['maxPlayTime'];
            $raw['best_with'] = $games[$gameIndex]['best_with'] ?? null;
            $raw['recommended_with'] = $games[$gameIndex]['recommended_with'] ?? null;
            $raw['designer'] = $games[$gameIndex]['designer'] ?? null;
            $raw['average_rating'] = $games[$gameIndex]['average_rating'] ?? null;
            $raw['bgg_rating'] = $games[$gameIndex]['bgg_rating'] ?? null;
            $raw['weight'] = $games[$gameIndex]['weight'] ?? null;
            $raw['isExpansion'] = (bool)$games[$gameIndex]['isExpansion'];
            $raw['isBaseGame'] = (bool)$games[$gameIndex]['isBaseGame'];
            $games[$gameIndex]['rawJson'] = json_encode($raw, JSON_UNESCAPED_SLASHES);
        }
    }
}

/**
 * @param array<int, array<string, mixed>> $games
 * @return array<int, array<string, mixed>>
 */
function hydrate_games_with_bgg_details(array $games): array {
    if ($games === []) {
        return $games;
    }

    $gamesByBggId = [];
    foreach ($games as $index => $game) {
        $bggId = (int)($game['bggId'] ?? 0);
        if ($bggId > 0) {
            $gamesByBggId[$bggId] = $index;
        }
    }

    $bggIds = array_keys($gamesByBggId);
    $totalGames = count($bggIds);
    $processedGames = 0;

    foreach (array_chunk($bggIds, BGG_THING_BATCH_SIZE) as $batchIndex => $idBatch) {
        try {
            $xml = request_bgg_xml_with_polling(
                'thing',
                [
                    'id' => implode(',', $idBatch),
                    'stats' => '1',
                ],
                'Fetching BGG game details...',
                'bgg_thing_timeout',
                [
                    'phase' => 'details_fetch',
                    'currentGames' => $processedGames,
                    'totalGames' => $totalGames,
                    'currentPlays' => 0,
                    'totalPlays' => null,
                    'batch' => $batchIndex + 1,
                ],
                false
            );

            apply_bgg_thing_details_to_games($games, $gamesByBggId, $xml);
        } catch (RuntimeException $exception) {
            $message = (string)$exception->getMessage();
            if ($message !== 'bgg_thing_unavailable_status_400' || count($idBatch) <= 1) {
                throw $exception;
            }

            foreach ($idBatch as $singleId) {
                try {
                    $xml = request_bgg_xml_with_polling(
                        'thing',
                        [
                            'id' => (string)$singleId,
                            'stats' => '1',
                        ],
                        'Retrying BGG game details one-by-one...',
                        'bgg_thing_timeout',
                        [
                            'phase' => 'details_retry',
                            'currentGames' => $processedGames,
                            'totalGames' => $totalGames,
                            'currentPlays' => 0,
                            'totalPlays' => null,
                            'batch' => $batchIndex + 1,
                        ],
                        false
                    );
                    apply_bgg_thing_details_to_games($games, $gamesByBggId, $xml);
                } catch (RuntimeException $singleException) {
                    $singleMessage = (string)$singleException->getMessage();
                    if ($singleMessage !== 'bgg_thing_unavailable_status_400') {
                        throw $singleException;
                    }
                }
            }
        }

        $processedGames = min($totalGames, $processedGames + count($idBatch));
        write_sync_progress([
            'state' => 'polling',
            'phase' => 'details_ready',
            'message' => 'Fetched detailed BGG metadata for ' . $processedGames . ' of ' . $totalGames . ' games.',
            'currentGames' => $processedGames,
            'totalGames' => $totalGames,
            'currentPlays' => 0,
            'totalPlays' => null,
        ]);
    }

    return $games;
}

/**
 * @return array{plays: array<int, array<string, mixed>>, players: array<int, array<string, mixed>>}
 */
function fetch_plays_from_bgg(string $username, int $totalGames = 0, ?string $minDate = null): array {
    ensure_bgg_sync_dependencies();
    $username = sanitize_bgg_username($username);

    if ($minDate !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $minDate)) {
        throw new RuntimeException('invalid_min_date');
    }

    $plays = [];
    $playersById = [];
    $page = 1;
    $total = null;
    $originalPlayCount = 0;

    do {
        $requestParams = [
            'username' => $username,
            'page' => (string)$page,
        ];
        if ($minDate !== null) {
            $requestParams['mindate'] = $minDate;
        }

        $xml = request_bgg_xml_with_polling(
            'plays',
            $requestParams,
            'Waiting for BGG plays export...',
            'bgg_plays_timeout',
            [
                'phase' => 'plays_wait',
                'page' => $page,
                'currentGames' => $totalGames,
                'totalGames' => $totalGames,
                'currentPlays' => $originalPlayCount,
                'totalPlays' => $total,
            ]
        );

        $totalAttr = (string)($xml['total'] ?? '');
        if ($total === null && ctype_digit($totalAttr)) {
            $total = (int)$totalAttr;
        }

        write_sync_progress([
            'state' => 'polling',
            'phase' => 'plays_fetch',
            'message' => $total !== null
                ? 'Fetched ' . $originalPlayCount . ' of ' . $total . ' BGG play records...'
                : 'Fetching BGG play records...',
            'page' => $page,
            'currentGames' => $totalGames,
            'totalGames' => $totalGames,
            'currentPlays' => $originalPlayCount,
            'totalPlays' => $total,
        ]);

        $pageRows = 0;
        foreach ($xml->play as $play) {
            $pageRows += 1;
            $originalPlayCount += 1;

            if ($originalPlayCount % 25 === 0) {
                write_sync_progress([
                    'state' => 'polling',
                    'phase' => 'plays_fetch',
                    'message' => $total !== null
                        ? 'Fetched ' . $originalPlayCount . ' of ' . $total . ' BGG play records...'
                        : 'Fetching BGG play records...',
                    'page' => $page,
                    'currentGames' => $totalGames,
                    'totalGames' => $totalGames,
                    'currentPlays' => $originalPlayCount,
                    'totalPlays' => $total,
                ]);
            }

            $playId = (int)($play['id'] ?? 0);
            $bggId = (int)($play->item['objectid'] ?? 0);
            if ($playId <= 0 || $bggId <= 0) {
                continue;
            }

            $quantityRaw = (string)($play['quantity'] ?? '1');
            $quantity = ctype_digit($quantityRaw) ? max(1, (int)$quantityRaw) : 1;
            $durationRaw = (string)($play['length'] ?? '0');
            $durationMin = ctype_digit($durationRaw) ? (int)$durationRaw : 0;
            $playDate = trim((string)($play['date'] ?? ''));
            $location = trim((string)($play['location'] ?? ''));
            $comments = trim((string)($play->comments ?? ''));
            $gameName = trim((string)($play->item['name'] ?? ''));

            $playerScores = [];
            $playersNode = $play->players->player ?? [];
            foreach ($playersNode as $player) {
                $userIdRaw = (string)($player['userid'] ?? '');
                $userId = ctype_digit($userIdRaw) ? (int)$userIdRaw : 0;
                $playerName = trim((string)($player['name'] ?? $player['username'] ?? 'Unknown Player'));
                $playerRefId = $userId > 0 ? 'bgg_player_' . $userId : 'bgg_player_name_' . sha1(strtolower($playerName));

                $playersById[$playerRefId] = [
                    'id' => $playerRefId,
                    'name' => $playerName,
                ];

                $scoreRaw = (string)($player['score'] ?? '');
                $ratingRaw = (string)($player['rating'] ?? '');
                $playerScores[] = [
                    'playerRefId' => $playerRefId,
                    'playerName' => $playerName,
                    'score' => is_numeric($scoreRaw) ? (float)$scoreRaw : null,
                    'winner' => ((string)($player['win'] ?? '0')) === '1',
                    'new' => ((string)($player['new'] ?? '0')) === '1',
                    'rating' => is_numeric($ratingRaw) ? (float)$ratingRaw : null,
                ];
            }

            $raw = [
                'playId' => $playId,
                'gameId' => $bggId,
                'gameName' => $gameName,
                'playDate' => $playDate,
                'durationMin' => $durationMin,
                'quantity' => $quantity,
                'location' => $location,
                'comments' => $comments,
                'players' => $playerScores,
            ];

            for ($copyIndex = 1; $copyIndex <= $quantity; $copyIndex += 1) {
                $plays[] = [
                    'id' => 'bgg_play_' . $playId . '_' . $copyIndex,
                    'playDate' => $playDate,
                    'durationMin' => $durationMin,
                    'gameRefId' => 'bgg_' . $bggId,
                    'quantity' => 1,
                    'location' => $location,
                    'comments' => $comments,
                    'playerScores' => json_encode($playerScores, JSON_UNESCAPED_SLASHES),
                    'rawJson' => json_encode($raw + ['quantityIndex' => $copyIndex], JSON_UNESCAPED_SLASHES),
                ];
            }
        }

        if ($pageRows === 0) {
            break;
        }

        write_sync_progress([
            'state' => 'polling',
            'phase' => 'plays_fetch',
            'message' => $total !== null
                ? 'Fetched ' . $originalPlayCount . ' of ' . $total . ' BGG play records...'
                : 'Fetching BGG play records...',
            'page' => $page,
            'currentGames' => $totalGames,
            'totalGames' => $totalGames,
            'currentPlays' => $originalPlayCount,
            'totalPlays' => $total,
        ]);

        $page += 1;
        $shouldContinue = $total !== null
            ? $originalPlayCount < $total
            : $pageRows >= BGG_PLAYS_PER_PAGE;
    } while ($shouldContinue);

    return [
        'plays' => $plays,
        'players' => array_values($playersById),
    ];
}

/**
 * @return array{insertedPlays:int, fetchedPlays:int, insertedPlayers:int, insertedPlayPlayers:int}
 */
function append_recent_plays_to_existing_database(array $plays, array $players): array {
    ensure_bgg_sync_dependencies();

    $activeDbPath = __DIR__ . '/../bgg.db';
    if (!is_file($activeDbPath)) {
        throw new RuntimeException('active_db_missing');
    }

    $db = new SQLite3($activeDbPath);
    $db->busyTimeout(3000);
    $db->exec('PRAGMA journal_mode=WAL;');
    $db->exec('PRAGMA synchronous=NORMAL;');

    $insertedPlays = 0;
    $insertedPlayers = 0;
    $insertedPlayPlayers = 0;

    try {
        $db->exec('BEGIN TRANSACTION');

        // Keep incremental sync resilient even on old databases.
        $db->exec('CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            name TEXT
        )');
        $db->exec('CREATE TABLE IF NOT EXISTS play_players (
            id TEXT PRIMARY KEY,
            playId TEXT NOT NULL,
            playerRefId TEXT,
            playerName TEXT NOT NULL,
            score REAL,
            winner INTEGER DEFAULT 0
        )');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_play_players_playId ON play_players (playId)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_play_players_playerRefId ON play_players (playerRefId)');

        $playsStmt = $db->prepare('INSERT OR IGNORE INTO plays (
            id, playDate, durationMin, gameRefId, quantity, location, comments, playerScores, rawJson
        ) VALUES (
            :id, :playDate, :durationMin, :gameRefId, :quantity, :location, :comments, :playerScores, :rawJson
        )');
        if (!$playsStmt) {
            throw new RuntimeException('plays_upsert_prepare_failed');
        }

        $totalPlays = count($plays);
        foreach ($plays as $index => $play) {
            $playsStmt->bindValue(':id', (string)$play['id'], SQLITE3_TEXT);
            $playsStmt->bindValue(':playDate', (string)$play['playDate'], SQLITE3_TEXT);
            $playsStmt->bindValue(':durationMin', (int)$play['durationMin'], SQLITE3_INTEGER);
            $playsStmt->bindValue(':gameRefId', (string)$play['gameRefId'], SQLITE3_TEXT);
            $playsStmt->bindValue(':quantity', (int)$play['quantity'], SQLITE3_INTEGER);
            $playsStmt->bindValue(':location', (string)$play['location'], SQLITE3_TEXT);
            $playsStmt->bindValue(':comments', (string)$play['comments'], SQLITE3_TEXT);
            $playsStmt->bindValue(':playerScores', (string)$play['playerScores'], SQLITE3_TEXT);
            $playsStmt->bindValue(':rawJson', (string)$play['rawJson'], SQLITE3_TEXT);

            if ($playsStmt->execute() === false) {
                throw new RuntimeException('plays_upsert_execute_failed');
            }

            if ($db->changes() > 0) {
                $insertedPlays += 1;
            }

            if (($index + 1) % 25 === 0 || ($index + 1) === $totalPlays) {
                write_sync_progress([
                    'state' => 'imported',
                    'phase' => 'import_recent_plays',
                    'message' => 'Upserting last-week plays into existing bgg.db...',
                    'currentGames' => 0,
                    'totalGames' => 0,
                    'currentPlays' => $index + 1,
                    'totalPlays' => $totalPlays,
                    'insertedPlays' => $insertedPlays,
                ]);
            }
        }

        $playersStmt = $db->prepare('INSERT OR IGNORE INTO players (id, name) VALUES (:id, :name)');
        if (!$playersStmt) {
            throw new RuntimeException('players_upsert_prepare_failed');
        }

        foreach ($players as $player) {
            $playersStmt->bindValue(':id', (string)$player['id'], SQLITE3_TEXT);
            $playersStmt->bindValue(':name', (string)$player['name'], SQLITE3_TEXT);
            if ($playersStmt->execute() === false) {
                throw new RuntimeException('players_upsert_execute_failed');
            }
            if ($db->changes() > 0) {
                $insertedPlayers += 1;
            }
        }

        $playPlayersStmt = $db->prepare('INSERT OR IGNORE INTO play_players (
            id, playId, playerRefId, playerName, score, winner
        ) VALUES (
            :id, :playId, :playerRefId, :playerName, :score, :winner
        )');
        if (!$playPlayersStmt) {
            throw new RuntimeException('play_players_upsert_prepare_failed');
        }

        foreach ($plays as $play) {
            $playId = (string)($play['id'] ?? '');
            if ($playId === '') {
                continue;
            }

            $scoresRaw = (string)($play['playerScores'] ?? '');
            if ($scoresRaw === '') {
                continue;
            }

            $scores = json_decode($scoresRaw, true);
            if (!is_array($scores)) {
                continue;
            }

            foreach ($scores as $index => $scoreEntry) {
                if (!is_array($scoreEntry)) {
                    continue;
                }

                $playerRefId = trim((string)($scoreEntry['playerRefId'] ?? ''));
                $playerName = trim((string)($scoreEntry['playerName'] ?? 'Unknown Player'));
                $scoreValueRaw = $scoreEntry['score'] ?? null;
                $scoreValue = is_numeric($scoreValueRaw) ? (float)$scoreValueRaw : null;
                $winner = (($scoreEntry['winner'] ?? false) === true || (string)($scoreEntry['winner'] ?? '0') === '1') ? 1 : 0;
                $rowId = $playId . '_idx_' . (string)$index;

                $playPlayersStmt->bindValue(':id', $rowId, SQLITE3_TEXT);
                $playPlayersStmt->bindValue(':playId', $playId, SQLITE3_TEXT);
                $playPlayersStmt->bindValue(':playerRefId', $playerRefId !== '' ? $playerRefId : null, $playerRefId !== '' ? SQLITE3_TEXT : SQLITE3_NULL);
                $playPlayersStmt->bindValue(':playerName', $playerName, SQLITE3_TEXT);
                $playPlayersStmt->bindValue(':score', $scoreValue, $scoreValue === null ? SQLITE3_NULL : SQLITE3_FLOAT);
                $playPlayersStmt->bindValue(':winner', $winner, SQLITE3_INTEGER);

                if ($playPlayersStmt->execute() === false) {
                    throw new RuntimeException('play_players_upsert_execute_failed');
                }
                if ($db->changes() > 0) {
                    $insertedPlayPlayers += 1;
                }
            }
        }

        $db->exec('COMMIT');
    } catch (Throwable $exception) {
        $db->exec('ROLLBACK');
        $db->close();
        throw $exception;
    }

    $db->close();

    return [
        'insertedPlays' => $insertedPlays,
        'fetchedPlays' => count($plays),
        'insertedPlayers' => $insertedPlayers,
        'insertedPlayPlayers' => $insertedPlayPlayers,
    ];
}

function insert_games(SQLite3 $db, array $games, string $syncedAt, int $totalPlays): int {
    $stmt = $db->prepare('INSERT INTO games (
        id, name, bggYear, minPlayerCount, maxPlayerCount, best_with, recommended_with, designer, rating, average_rating, modificationDate,
        bggRating, bgg_rating, weight, isExpansion, isBaseGame, urlThumb, maxPlayTime, minPlayTime,
        bggId, owned, bgg_lastmodified, rawJson, syncedAt
    ) VALUES (
        :id, :name, :bggYear, :minPlayerCount, :maxPlayerCount, :bestWith, :recommendedWith, :designer, :rating, :averageRating, :modificationDate,
        :bggRating, :bggRatingSnake, :weight, :isExpansion, :isBaseGame, :urlThumb, :maxPlayTime, :minPlayTime,
        :bggId, :owned, :bggLastModified, :rawJson, :syncedAt
    )');

    if (!$stmt) {
        throw new RuntimeException('games_insert_prepare_failed');
    }

    $inserted = 0;
    $totalGames = count($games);
    foreach ($games as $game) {
        $stmt->bindValue(':id', (string)$game['id'], SQLITE3_TEXT);
        $stmt->bindValue(':name', (string)$game['name'], SQLITE3_TEXT);
        $stmt->bindValue(':bggYear', $game['bggYear'], $game['bggYear'] === null ? SQLITE3_NULL : SQLITE3_INTEGER);
        $stmt->bindValue(':minPlayerCount', (int)($game['minPlayerCount'] ?? 0), SQLITE3_INTEGER);
        $stmt->bindValue(':maxPlayerCount', (int)($game['maxPlayerCount'] ?? 0), SQLITE3_INTEGER);
        $bestWith = $game['best_with'] ?? null;
        $stmt->bindValue(':bestWith', $bestWith, $bestWith === null ? SQLITE3_NULL : SQLITE3_TEXT);
        $recommendedWith = $game['recommended_with'] ?? null;
        $stmt->bindValue(':recommendedWith', $recommendedWith, $recommendedWith === null ? SQLITE3_NULL : SQLITE3_TEXT);
        $designer = $game['designer'] ?? null;
        $stmt->bindValue(':designer', $designer, $designer === null ? SQLITE3_NULL : SQLITE3_TEXT);
        $stmt->bindValue(':rating', $game['rating'], $game['rating'] === null ? SQLITE3_NULL : SQLITE3_FLOAT);
        $averageRating = $game['average_rating'] ?? $game['rating'] ?? null;
        $stmt->bindValue(':averageRating', $averageRating, $averageRating === null ? SQLITE3_NULL : SQLITE3_FLOAT);
        $stmt->bindValue(':modificationDate', $syncedAt, SQLITE3_TEXT);
        $stmt->bindValue(':bggRating', $game['bggRating'], $game['bggRating'] === null ? SQLITE3_NULL : SQLITE3_FLOAT);
        $bggRatingSnake = $game['bgg_rating'] ?? $game['bggRating'] ?? null;
        $stmt->bindValue(':bggRatingSnake', $bggRatingSnake, $bggRatingSnake === null ? SQLITE3_NULL : SQLITE3_FLOAT);
        $stmt->bindValue(':weight', $game['weight'], $game['weight'] === null ? SQLITE3_NULL : SQLITE3_FLOAT);
        $stmt->bindValue(':isExpansion', (int)$game['isExpansion'], SQLITE3_INTEGER);
        $stmt->bindValue(':isBaseGame', (int)$game['isBaseGame'], SQLITE3_INTEGER);
        $stmt->bindValue(':urlThumb', (string)$game['thumbnail'], SQLITE3_TEXT);
        $stmt->bindValue(':maxPlayTime', (int)($game['maxPlayTime'] ?? 0), SQLITE3_INTEGER);
        $stmt->bindValue(':minPlayTime', (int)($game['minPlayTime'] ?? 0), SQLITE3_INTEGER);
        $stmt->bindValue(':bggId', (int)$game['bggId'], SQLITE3_INTEGER);
        $stmt->bindValue(':owned', (int)($game['owned'] ?? 0), SQLITE3_INTEGER);
        $bggLastModified = $game['bgg_lastmodified'] ?? null;
        $stmt->bindValue(':bggLastModified', $bggLastModified, $bggLastModified === null ? SQLITE3_NULL : SQLITE3_TEXT);
        $stmt->bindValue(':rawJson', (string)$game['rawJson'], SQLITE3_TEXT);
        $stmt->bindValue(':syncedAt', $syncedAt, SQLITE3_TEXT);

        if ($stmt->execute() === false) {
            throw new RuntimeException('games_insert_execute_failed');
        }
        $inserted += 1;

        if ($inserted === $totalGames || $inserted % 10 === 0) {
            write_sync_progress([
                'state' => 'imported',
                'phase' => 'import_games',
                'message' => 'Writing collection games into bgg.db...',
                'currentGames' => $inserted,
                'totalGames' => $totalGames,
                'currentPlays' => 0,
                'totalPlays' => $totalPlays,
            ]);
        }
    }

    return $inserted;
}

function insert_plays(SQLite3 $db, array $plays, int $totalGames): int {
    $stmt = $db->prepare('INSERT INTO plays (
        id, playDate, durationMin, gameRefId, quantity, location, comments, playerScores, rawJson
    ) VALUES (
        :id, :playDate, :durationMin, :gameRefId, :quantity, :location, :comments, :playerScores, :rawJson
    )');

    if (!$stmt) {
        throw new RuntimeException('plays_insert_prepare_failed');
    }

    $inserted = 0;
    $totalPlays = count($plays);
    foreach ($plays as $play) {
        $stmt->bindValue(':id', (string)$play['id'], SQLITE3_TEXT);
        $stmt->bindValue(':playDate', (string)$play['playDate'], SQLITE3_TEXT);
        $stmt->bindValue(':durationMin', (int)$play['durationMin'], SQLITE3_INTEGER);
        $stmt->bindValue(':gameRefId', (string)$play['gameRefId'], SQLITE3_TEXT);
        $stmt->bindValue(':quantity', (int)$play['quantity'], SQLITE3_INTEGER);
        $stmt->bindValue(':location', (string)$play['location'], SQLITE3_TEXT);
        $stmt->bindValue(':comments', (string)$play['comments'], SQLITE3_TEXT);
        $stmt->bindValue(':playerScores', (string)$play['playerScores'], SQLITE3_TEXT);
        $stmt->bindValue(':rawJson', (string)$play['rawJson'], SQLITE3_TEXT);

        if ($stmt->execute() === false) {
            throw new RuntimeException('plays_insert_execute_failed');
        }
        $inserted += 1;

        if ($inserted === $totalPlays || $inserted % 50 === 0) {
            write_sync_progress([
                'state' => 'imported',
                'phase' => 'import_plays',
                'message' => 'Writing plays into bgg.db...',
                'currentGames' => $totalGames,
                'totalGames' => $totalGames,
                'currentPlays' => $inserted,
                'totalPlays' => $totalPlays,
            ]);
        }
    }

    return $inserted;
}

function insert_players(SQLite3 $db, array $players): int {
    $stmt = $db->prepare('INSERT INTO players (id, name) VALUES (:id, :name)');
    if (!$stmt) {
        throw new RuntimeException('players_insert_prepare_failed');
    }

    $inserted = 0;
    foreach ($players as $player) {
        $stmt->bindValue(':id', (string)$player['id'], SQLITE3_TEXT);
        $stmt->bindValue(':name', (string)$player['name'], SQLITE3_TEXT);
        if ($stmt->execute() === false) {
            throw new RuntimeException('players_insert_execute_failed');
        }
        $inserted += 1;
    }

    return $inserted;
}

function insert_play_players(SQLite3 $db, array $plays): int {
    $stmt = $db->prepare('INSERT INTO play_players (
        id, playId, playerRefId, playerName, score, winner
    ) VALUES (
        :id, :playId, :playerRefId, :playerName, :score, :winner
    )');
    if (!$stmt) {
        throw new RuntimeException('play_players_insert_prepare_failed');
    }

    $inserted = 0;
    foreach ($plays as $play) {
        $playId = (string)($play['id'] ?? '');
        if ($playId === '') {
            continue;
        }

        $scoresRaw = (string)($play['playerScores'] ?? '');
        if ($scoresRaw === '') {
            continue;
        }

        $scores = json_decode($scoresRaw, true);
        if (!is_array($scores)) {
            continue;
        }

        foreach ($scores as $index => $scoreEntry) {
            if (!is_array($scoreEntry)) {
                continue;
            }

            $playerRefId = trim((string)($scoreEntry['playerRefId'] ?? ''));
            $playerName = trim((string)($scoreEntry['playerName'] ?? 'Unknown Player'));
            $scoreValueRaw = $scoreEntry['score'] ?? null;
            $scoreValue = is_numeric($scoreValueRaw) ? (float)$scoreValueRaw : null;
            $winner = (($scoreEntry['winner'] ?? false) === true || (string)($scoreEntry['winner'] ?? '0') === '1') ? 1 : 0;

            // Keep row ids deterministic but always unique within a play.
            $rowId = $playId . '_idx_' . (string)$index;

            $stmt->bindValue(':id', $rowId, SQLITE3_TEXT);
            $stmt->bindValue(':playId', $playId, SQLITE3_TEXT);
            $stmt->bindValue(':playerRefId', $playerRefId !== '' ? $playerRefId : null, $playerRefId !== '' ? SQLITE3_TEXT : SQLITE3_NULL);
            $stmt->bindValue(':playerName', $playerName, SQLITE3_TEXT);
            $stmt->bindValue(':score', $scoreValue, $scoreValue === null ? SQLITE3_NULL : SQLITE3_FLOAT);
            $stmt->bindValue(':winner', $winner, SQLITE3_INTEGER);

            if ($stmt->execute() === false) {
                throw new RuntimeException('play_players_insert_execute_failed');
            }
            $inserted += 1;
        }
    }

    return $inserted;
}

/**
 * @return array{dbPath:string, backupPath:string|null, insertedGames:int, insertedPlays:int, insertedPlayers:int}
 */
function create_synced_bgg_database(array $games, array $plays, array $players): array {
    ensure_bgg_sync_dependencies();

    $activeDbPath = __DIR__ . '/../bgg.db';
    $storageDir = __DIR__ . '/../db_storage';
    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0755, true);
    }

    $backupPath = null;
    if (is_file($activeDbPath)) {
        // Delete any existing backups (keep only one)
        $existingBackups = glob($storageDir . '/bgg_backup_sync_*.db');
        foreach ($existingBackups as $oldBackup) {
            @unlink($oldBackup);
        }
        // Create new backup
        $backupPath = $storageDir . '/bgg_backup_sync_' . date('Ymd_His') . '.db';
        @copy($activeDbPath, $backupPath);
    }

    $tempDbPath = $activeDbPath . '.tmp';
    @unlink($tempDbPath);

    $db = new SQLite3($tempDbPath);
    try {
        $db->busyTimeout(3000);
        $db->exec('PRAGMA journal_mode=WAL;');
        $db->exec('PRAGMA synchronous=NORMAL;');

        write_sync_progress([
            'state' => 'imported',
            'phase' => 'import_prepare',
            'message' => 'Importing synced games and plays into SQLite...',
            'currentGames' => 0,
            'totalGames' => count($games),
            'currentPlays' => 0,
            'totalPlays' => count($plays),
        ]);

        $db->exec('BEGIN TRANSACTION');
        $db->exec('CREATE TABLE games (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bggYear INTEGER,
            minPlayerCount INTEGER DEFAULT 0,
            maxPlayerCount INTEGER DEFAULT 0,
            best_with TEXT,
            recommended_with TEXT,
            designer TEXT,
            rating REAL,
            average_rating REAL,
            modificationDate TEXT,
            bggRating REAL,
            bgg_rating REAL,
            weight REAL,
            isExpansion INTEGER DEFAULT 0,
            isBaseGame INTEGER DEFAULT 1,
            urlThumb TEXT,
            maxPlayTime INTEGER DEFAULT 0,
            minPlayTime INTEGER DEFAULT 0,
            bggId INTEGER,
            owned INTEGER DEFAULT 1,
            bgg_lastmodified TEXT,
            rawJson TEXT,
            syncedAt TEXT
        )');
        $db->exec('CREATE INDEX idx_games_bggId ON games (bggId)');

        $db->exec('CREATE TABLE plays (
            id TEXT PRIMARY KEY,
            playDate TEXT,
            durationMin INTEGER,
            gameRefId TEXT,
            quantity INTEGER DEFAULT 1,
            location TEXT,
            comments TEXT,
            playerScores TEXT,
            rawJson TEXT
        )');
        $db->exec('CREATE INDEX idx_plays_gameRefId ON plays (gameRefId)');
        $db->exec('CREATE INDEX idx_plays_playDate ON plays (playDate)');

        $db->exec('CREATE TABLE players (
            id TEXT PRIMARY KEY,
            name TEXT
        )');

        $db->exec('CREATE TABLE play_players (
            id TEXT PRIMARY KEY,
            playId TEXT NOT NULL,
            playerRefId TEXT,
            playerName TEXT NOT NULL,
            score REAL,
            winner INTEGER DEFAULT 0
        )');
        $db->exec('CREATE INDEX idx_play_players_playId ON play_players (playId)');
        $db->exec('CREATE INDEX idx_play_players_playerRefId ON play_players (playerRefId)');

        $syncedAt = gmdate('c');
        $insertedGames = insert_games($db, $games, $syncedAt, count($plays));
        $insertedPlays = insert_plays($db, $plays, count($games));
        $insertedPlayers = insert_players($db, $players);
        insert_play_players($db, $plays);
        $db->exec('COMMIT');
    } catch (Throwable $exception) {
        $db->exec('ROLLBACK');
        $db->close();
        @unlink($tempDbPath);
        throw $exception;
    }

    $db->close();
    @unlink($activeDbPath);
    if (!@rename($tempDbPath, $activeDbPath)) {
        throw new RuntimeException('unable_to_publish_database');
    }

    @chmod($activeDbPath, 0600);

    return [
        'dbPath' => $activeDbPath,
        'backupPath' => $backupPath,
        'insertedGames' => $insertedGames,
        'insertedPlays' => $insertedPlays,
        'insertedPlayers' => $insertedPlayers,
    ];
}
