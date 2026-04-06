<?php
declare(strict_types=1);

const BGG_SYNC_LOG_FILE = __DIR__ . '/../db_storage/bgg_sync_log.json';
const BGG_SYNC_LOG_MAX_ENTRIES = 10;

/**
 * @return array<int, array<string, mixed>>
 */
function read_sync_log(): array {
    if (!is_file(BGG_SYNC_LOG_FILE)) {
        return [];
    }

    $raw = @file_get_contents(BGG_SYNC_LOG_FILE);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * @param array<string, mixed> $details
 */
function append_sync_log_entry(string $type, string $startedAt, string $finishedAt, bool $success, array $details = []): void {
    $dir = dirname(BGG_SYNC_LOG_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $entries = read_sync_log();
    $entries[] = [
        'type'       => $type,
        'startedAt'  => $startedAt,
        'finishedAt' => $finishedAt,
        'success'    => $success,
        'details'    => $details,
    ];

    if (count($entries) > BGG_SYNC_LOG_MAX_ENTRIES) {
        $entries = array_slice($entries, -BGG_SYNC_LOG_MAX_ENTRIES);
    }

    @file_put_contents(
        BGG_SYNC_LOG_FILE,
        json_encode(array_values($entries), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}
