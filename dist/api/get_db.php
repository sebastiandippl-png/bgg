<?php
declare(strict_types=1);

// Secure API endpoint for serving the SQLite database to the client
// Only serves to AJAX requests (requires X-Requested-With header)
// Prevents direct browser downloads for security

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Content-Security-Policy: default-src \'none\'');
header('X-XSS-Protection: 1; mode=block');

/**
 * Read local config array from dist/api/local_config.php if present.
 *
 * @return array<string, mixed>
 */
function getLocalConfigValues(): array {
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    $configPath = __DIR__ . '/local_config.php';
    if (!is_file($configPath) || !is_readable($configPath)) {
        $cached = [];
        return $cached;
    }

    $loaded = require $configPath;
    $cached = is_array($loaded) ? $loaded : [];
    return $cached;
}

/**
 * Normalize a URL (or origin-like string) into scheme://host[:port].
 */
function normalizeOrigin(string $value): ?string {
    $value = trim($value);
    if ($value === '') {
        return null;
    }

    if (!preg_match('/^https?:\/\//i', $value)) {
        return null;
    }

    $parts = parse_url($value);
    if (!is_array($parts)) {
        return null;
    }

    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (($scheme !== 'http' && $scheme !== 'https') || $host === '') {
        return null;
    }

    $port = isset($parts['port']) ? (int)$parts['port'] : null;
    $defaultPort = $scheme === 'https' ? 443 : 80;
    if ($port !== null && $port > 0 && $port !== $defaultPort) {
        return sprintf('%s://%s:%d', $scheme, $host, $port);
    }

    return sprintf('%s://%s', $scheme, $host);
}

/**
 * Build allowed origins from env/local config plus current request host fallback.
 *
 * @return string[]
 */
function getAllowedOrigins(): array {
    $local = getLocalConfigValues();
    $fromEnv = trim((string)(getenv('BGSTATS_ALLOWED_ORIGINS') ?: ''));
    $configured = $fromEnv;
    if ($configured === '') {
        $configured = trim((string)($local['BGSTATS_ALLOWED_ORIGINS'] ?? ($local['BGSTATS_ALLOWED_ORIGIN'] ?? '')));
    }

    $origins = [];
    if ($configured !== '') {
        $parts = preg_split('/\s*,\s*/', $configured) ?: [];
        foreach ($parts as $part) {
            $normalized = normalizeOrigin((string)$part);
            if ($normalized !== null) {
                $origins[$normalized] = true;
            }
        }
    }

    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host !== '') {
        $forwardedProto = strtolower(trim((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')));
        $isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') || $forwardedProto === 'https';
        $scheme = $isHttps ? 'https' : 'http';
        $fallback = normalizeOrigin($scheme . '://' . $host);
        if ($fallback !== null) {
            $origins[$fallback] = true;
        }
    }

    return array_keys($origins);
}

/**
 * Resolve request origin from Origin or Referer header.
 */
function getRequestOrigin(): ?string {
    $originHeader = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    $origin = normalizeOrigin($originHeader);
    if ($origin !== null) {
        return $origin;
    }

    $refererHeader = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
    $refererOrigin = normalizeOrigin($refererHeader);
    if ($refererOrigin !== null) {
        return $refererOrigin;
    }

    return null;
}

// Error response helper
function respondError(int $code, string $message): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

// Restrict allowed HTTP methods
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    respondError(405, 'Method not allowed');
}

// AJAX-only checking (prevent direct browser access)
if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || $_SERVER['HTTP_X_REQUESTED_WITH'] !== 'XMLHttpRequest') {
    respondError(403, 'Access denied. Direct database download not allowed.');
}

// Same-origin (or configured origin) enforcement via Origin/Referer
$allowedOrigins = getAllowedOrigins();
$requestOrigin = getRequestOrigin();

if ($requestOrigin === null || !in_array($requestOrigin, $allowedOrigins, true)) {
    respondError(403, 'Origin not allowed');
}

// Check for active database first (dist/bgg.db)
$active_db = __DIR__ . '/../bgg.db';

if (file_exists($active_db) && is_readable($active_db)) {
    $db_file = $active_db;
} else {
    // Fallback to most recent backup if active DB doesn't exist
    $storage_dir = __DIR__ . '/../db_storage';
    
    // Validate storage directory exists
    if (!is_dir($storage_dir)) {
        respondError(404, 'No database found');
    }
    
    // Get all backup files
    $files = glob($storage_dir . '/bgg_backup_*');
    
    if (empty($files)) {
        respondError(404, 'No database found');
    }
    
    // Sort by modification time, get the latest
    usort($files, function($a, $b) {
        return filemtime($b) - filemtime($a);
    });
    
    $db_file = $files[0];
}

// Verify file safety (exists, readable)
if (!file_exists($db_file) || !is_readable($db_file)) {
    respondError(500, 'Database file is not accessible');
}

// Path traversal prevention: verify file is within allowed directories
$real_file = realpath($db_file);
$real_dist = realpath(__DIR__ . '/..');
$real_storage = realpath(__DIR__ . '/../db_storage');

// File must be either in dist/ or db_storage/
if (!$real_file || 
    (strpos($real_file, $real_dist) !== 0 && (!$real_storage || strpos($real_file, $real_storage) !== 0))) {
    respondError(403, 'Invalid file path');
}

// Set response headers
header('Content-Type: application/octet-stream');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');
$modifiedAt = @filemtime($db_file);
if ($modifiedAt !== false) {
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT');
}
header('Vary: Origin');

// For HEAD requests, return headers only (don't send file content)
if ($method === 'HEAD') {
    exit;
}

// For GET requests, serve the binary file
readfile($db_file);
?>
