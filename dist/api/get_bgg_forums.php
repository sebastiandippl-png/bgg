<?php
declare(strict_types=1);

@error_reporting(E_ALL);
@ini_set('display_errors', '0');

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require_once __DIR__ . '/bgg_api.php';

const FORUM_CACHE_TTL = 3600; // 1 hour
const FORUM_THREAD_COUNT = 10;
const FORUM_TITLES = ['News', 'General'];

function get_forum_cache_dir(): string {
    $dir = __DIR__ . '/../db_storage/cache_bgg/forums';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

function get_forum_cache_file(string $bggId): string {
    $safeBggId = preg_replace('/[^0-9]/', '', $bggId);
    return get_forum_cache_dir() . '/' . sha1('forums|' . $safeBggId) . '.json';
}

/**
 * Fetch the forumlist for a BGG thing and return forum id mapped by title.
 *
 * @return array<string,int>
 */
function fetch_forum_ids(string $bggId): array {
    $result = bgg_http_get('forumlist', ['id' => $bggId, 'type' => 'thing']);
    if ($result['status'] !== 200 || $result['body'] === '') {
        return [];
    }

    $xml = @simplexml_load_string($result['body']);
    if ($xml === false) {
        return [];
    }

    $map = [];
    foreach ($xml->forum as $forum) {
        $title = trim((string)($forum['title'] ?? ''));
        $id = (int)($forum['id'] ?? 0);
        if ($title !== '' && $id > 0) {
            $map[$title] = $id;
        }
    }

    return $map;
}

/**
 * Fetch the most recent threads (up to $count) from a forum.
 *
 * @return list<array{id:int,subject:string,author:string,postdate:string,lastpostdate:string}>
 */
function fetch_forum_threads(int $forumId, int $count): array {
    $result = bgg_http_get('forum', ['id' => (string)$forumId, 'page' => '1']);
    if ($result['status'] !== 200 || $result['body'] === '') {
        return [];
    }

    $xml = @simplexml_load_string($result['body']);
    if ($xml === false || !isset($xml->threads)) {
        return [];
    }

    $threads = [];
    $added = 0;
    foreach ($xml->threads->thread as $thread) {
        if ($added >= $count) {
            break;
        }
        $id = (int)($thread['id'] ?? 0);
        $subject = trim((string)($thread['subject'] ?? ''));
        $author = trim((string)($thread['author'] ?? ''));
        $postdate = trim((string)($thread['postdate'] ?? ''));
        $lastpostdate = trim((string)($thread['lastpostdate'] ?? ''));

        if ($id <= 0 || $subject === '') {
            continue;
        }

        $threads[] = [
            'id'           => $id,
            'subject'      => $subject,
            'author'       => $author,
            'postdate'     => $postdate,
            'lastpostdate' => $lastpostdate,
        ];
        $added++;
    }

    return $threads;
}

try {
    $bggId = isset($_GET['bgg_id']) ? trim((string)$_GET['bgg_id']) : '';
    if ($bggId === '' || !preg_match('/^\d+$/', $bggId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'invalid_bgg_id']);
        exit;
    }

    $cacheFile = get_forum_cache_file($bggId);

    // Serve from cache if valid
    if (is_file($cacheFile) && is_readable($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (
            is_array($cached)
            && isset($cached['timestamp'])
            && (time() - (int)$cached['timestamp']) < FORUM_CACHE_TTL
            && isset($cached['forums'])
        ) {
            echo json_encode(['success' => true, 'forums' => $cached['forums'], 'cached' => true]);
            exit;
        }
    }

    // Fetch forumlist to discover IDs for News + General
    $forumIds = fetch_forum_ids($bggId);

    $forums = [];
    foreach (FORUM_TITLES as $title) {
        $forumId = $forumIds[$title] ?? 0;
        if ($forumId <= 0) {
            $forums[$title] = [];
            continue;
        }
        $forums[$title] = fetch_forum_threads($forumId, FORUM_THREAD_COUNT);
    }

    // Cache the result
    $payload = ['timestamp' => time(), 'forums' => $forums];
    @file_put_contents($cacheFile, json_encode($payload));

    echo json_encode(['success' => true, 'forums' => $forums, 'cached' => false]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'server_error']);
}
