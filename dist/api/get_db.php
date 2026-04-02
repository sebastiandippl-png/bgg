<?php
// Secure API endpoint for serving the SQLite database to the client
// Only serves to AJAX requests (requires X-Requested-With header)
// Prevents direct browser downloads for security

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Content-Security-Policy: default-src \'none\'');
header('X-XSS-Protection: 1; mode=block');

// Error response helper
function respondError($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

// AJAX-only checking (prevent direct browser access)
if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || $_SERVER['HTTP_X_REQUESTED_WITH'] !== 'XMLHttpRequest') {
    respondError(403, 'Access denied. Direct database download not allowed.');
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

// For HEAD requests, return headers only (don't send file content)
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    exit;
}

// For GET requests, serve the binary file
readfile($db_file);
?>
