<?php
declare(strict_types=1);

const BGG_SYNC_STATUS_FILE = __DIR__ . '/../db_storage/bgg_sync_status.json';

/**
 * @return array<string, mixed>
 */
function read_bgg_sync_status(): array {
    if (!is_file(BGG_SYNC_STATUS_FILE)) {
        return [
            'state' => 'idle',
            'message' => null,
            'updatedAt' => gmdate('c'),
        ];
    }

    $raw = @file_get_contents(BGG_SYNC_STATUS_FILE);
    if ($raw === false || trim($raw) === '') {
        return [
            'state' => 'idle',
            'message' => null,
            'updatedAt' => gmdate('c'),
        ];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [
        'state' => 'idle',
        'message' => null,
        'updatedAt' => gmdate('c'),
    ];
}

/**
 * @param array<string, mixed> $payload
 */
function write_bgg_sync_status(array $payload): void {
    $dir = dirname(BGG_SYNC_STATUS_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $payload['updatedAt'] = gmdate('c');
    @file_put_contents(
        BGG_SYNC_STATUS_FILE,
        json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}
