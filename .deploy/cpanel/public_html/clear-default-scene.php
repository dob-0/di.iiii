<?php
header('Content-Type: application/json');

function respond_with_error($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function require_admin_token() {
    $expected = getenv('DEFAULT_SCENE_TOKEN');
    // If no token is configured, allow clearing (matches older deployments)
    if ($expected === false || $expected === '') {
        return;
    }
    $provided = $_SERVER['HTTP_X_SCENE_ADMIN'] ?? ($_POST['adminToken'] ?? '');
    if (!$provided || !hash_equals($expected, trim($provided))) {
        respond_with_error(403, 'Unauthorized');
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_with_error(405, 'Method not allowed');
}

require_admin_token();

$targetPath = __DIR__ . '/default-scene.zip';
$manifestPath = __DIR__ . '/default-scene.json';
$extractedDir = __DIR__ . '/default-scene';
$result = true;

if (file_exists($targetPath)) {
    $result = unlink($targetPath);
}

if (file_exists($manifestPath)) {
    unlink($manifestPath);
}

function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return true;
    }
    $items = array_diff(scandir($dir), ['.', '..']);
    foreach ($items as $item) {
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            deleteDirectory($path);
        } else {
            unlink($path);
        }
    }
    return rmdir($dir);
}

if (is_dir($extractedDir)) {
    $result = deleteDirectory($extractedDir) && $result;
}

if (!$result) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to remove default scene']);
    exit;
}

echo json_encode(['success' => true]);
