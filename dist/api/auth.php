<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
    ]);
}

/**
 * Return configured admin email from env or local config.
 */
function get_admin_email(): string {
    $adminEmail = trim((string)(getenv('BGSTATS_ADMIN_EMAIL') ?: ''));
    if ($adminEmail !== '') {
        return strtolower($adminEmail);
    }

    $local = get_local_config_values();
    return strtolower(trim((string)($local['BGSTATS_ADMIN_EMAIL'] ?? '')));
}

/**
 * Read local config array from dist/api/local_config.php if present.
 *
 * @return array<string, mixed>
 */
function get_local_config_values(): array {
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
 * Return configured Google client ID from env or local config.
 */
function get_google_client_id(): string {
    $clientId = trim((string)(getenv('BGSTATS_GOOGLE_CLIENT_ID') ?: ''));
    if ($clientId !== '') {
        return $clientId;
    }

    $local = get_local_config_values();
    return trim((string)($local['BGSTATS_GOOGLE_CLIENT_ID'] ?? ''));
}

/**
 * Verify a Google ID token by calling Google's tokeninfo endpoint.
 * Returns the claims array on success, or null on failure.
 */
function verify_google_id_token(string $idToken): ?array {
    $idToken = trim($idToken);
    if ($idToken === '' || strlen($idToken) > 4096) {
        return null;
    }

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken);
    $ctx = stream_context_create([
        'http' => ['method' => 'GET', 'timeout' => 5],
        'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);

    $json = @file_get_contents($url, false, $ctx);
    if ($json === false || $json === '') {
        return null;
    }

    $claims = json_decode($json, true);
    if (!is_array($claims) || isset($claims['error'])) {
        return null;
    }

    // Validate issuer
    $validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!in_array($claims['iss'] ?? '', $validIssuers, true)) {
        return null;
    }

    // Validate expiry
    if ((int)($claims['exp'] ?? 0) <= time()) {
        return null;
    }

    // Validate audience if client ID is configured
    $clientId = get_google_client_id();
    if ($clientId !== '' && ($claims['aud'] ?? '') !== $clientId) {
        return null;
    }

    return $claims;
}

/**
 * Returns true if the current session has an authenticated admin.
 */
function is_admin_authenticated(): bool {
    $adminEmail = get_admin_email();
    if ($adminEmail === '') {
        return false;
    }

    return !empty($_SESSION['admin_auth'])
        && strtolower((string)($_SESSION['admin_email'] ?? '')) === $adminEmail;
}

/**
 * Emit a 401 JSON error and exit if the request is not from an admin.
 */
function require_admin_json(): void {
    if (!is_admin_authenticated()) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

/**
 * Destroy the admin session data.
 */
function admin_logout(): void {
    unset($_SESSION['admin_auth'], $_SESSION['admin_email']);
}
