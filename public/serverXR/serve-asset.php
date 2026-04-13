<?php
// Lightweight asset fallback handler.
// Tries: SPACES_DIR/<space>/assets/<id> (plus optional <id>.json> for mime)
// then: DEFAULT_SCENE_ASSETS_DIR/<id> (default: ../default-scene/assets/<id>)

header('Cache-Control: public, max-age=31536000, immutable');

$space = $_GET['space'] ?? '';
$assetId = $_GET['id'] ?? '';

$normalize = fn($value) => preg_replace('~[^a-z0-9_-]+~i', '', $value ?? '');
$space = $normalize($space);
$assetId = $normalize($assetId);

if (!$space || !$assetId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing space or asset id']);
    exit;
}

$spacesDir = rtrim(getenv('SPACES_DIR') ?: __DIR__ . '/data/spaces', '/');
$defaultSceneDir = rtrim(getenv('DEFAULT_SCENE_ASSETS_DIR') ?: dirname(__DIR__) . '/default-scene/assets', '/');

function try_send_file($path, $metaPath = null) {
    if (!is_file($path)) {
        return false;
    }
    $mimeType = 'application/octet-stream';
    if ($metaPath && is_file($metaPath)) {
        $meta = json_decode(file_get_contents($metaPath) ?: '', true);
        if (!empty($meta['mimeType']) && is_string($meta['mimeType'])) {
            $mimeType = $meta['mimeType'];
        }
    }
    if ($mimeType === 'application/octet-stream') {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $detected = finfo_file($finfo, $path);
            finfo_close($finfo);
            if ($detected) {
                $mimeType = $detected;
            }
        }
    }
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($path));
    readfile($path);
    return true;
}

$spaceAssetPath = "{$spacesDir}/{$space}/assets/{$assetId}";
$spaceMetaPath = "{$spaceAssetPath}.json";
if (try_send_file($spaceAssetPath, $spaceMetaPath)) {
    exit;
}

$defaultAssetPath = "{$defaultSceneDir}/{$assetId}";
if (try_send_file($defaultAssetPath)) {
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Asset not found']);
