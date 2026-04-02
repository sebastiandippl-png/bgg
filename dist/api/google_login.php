<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$body = (string)file_get_contents('php://input');
$data = json_decode($body, true);

if (!is_array($data) || empty($data['id_token'])) {
    http_response_code(400);
    echo json_encode(['error' => 'missing_id_token']);
    exit;
}

$claims = verify_google_id_token((string)$data['id_token']);

if ($claims === null) {
    http_response_code(401);
    echo json_encode(['error' => 'invalid_token']);
    exit;
}

$email = strtolower((string)($claims['email'] ?? ''));
$adminEmail = get_admin_email();

if ($adminEmail === '') {
    http_response_code(500);
    echo json_encode(['error' => 'admin_email_not_configured']);
    exit;
}

if ($email !== $adminEmail) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$_SESSION['admin_auth']  = true;
$_SESSION['admin_email'] = $email;
session_regenerate_id(true);

echo json_encode(['ok' => true, 'email' => $email]);
