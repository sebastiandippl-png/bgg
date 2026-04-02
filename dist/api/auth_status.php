<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$clientId = get_google_client_id();

echo json_encode([
    'admin'    => is_admin_authenticated(),
    'email'    => is_admin_authenticated() ? ($_SESSION['admin_email'] ?? null) : null,
    'clientId' => $clientId,
]);
