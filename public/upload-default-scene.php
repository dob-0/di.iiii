<?php
header('Content-Type: application/json');

function respond_with_error($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function require_admin_token() {
    $expected = getenv('DEFAULT_SCENE_TOKEN');
    // If no token is configured, allow uploads (keeps backward compatibility with older deployments)
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

if (!isset($_FILES['scene'])) {
    respond_with_error(400, 'Missing scene file');
}

$file = $_FILES['scene'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    respond_with_error(400, 'Upload failed');
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowedMimeTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'multipart/x-zip',
    'application/octet-stream'
];

if (!in_array($mimeType, $allowedMimeTypes, true)) {
    respond_with_error(400, 'Invalid file type');
}

$maxSize = 1024 * 1024 * 1024; // 1 GB
if ($file['size'] > $maxSize) {
    respond_with_error(400, 'File too large (max 1GB)');
}

$targetPath = __DIR__ . '/default-scene.zip';
$extractDir = __DIR__ . '/default-scene';

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    respond_with_error(500, 'Failed to write file');
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

if (is_dir($extractDir)) {
    deleteDirectory($extractDir);
}

if (!mkdir($extractDir, 0775, true) && !is_dir($extractDir)) {
    respond_with_error(500, 'Failed to prepare extract directory');
}

$zip = new ZipArchive();

function isSafeZipEntry($name) {
    if (!is_string($name) || $name === '') {
        return false;
    }
    if (strpos($name, "\0") !== false) {
        return false;
    }
    $normalized = str_replace('\\', '/', $name);
    $normalized = ltrim($normalized, '/');
    $normalized = preg_replace('#/+#', '/', $normalized);
    if ($normalized === '' || str_contains($normalized, '../')) {
        return false;
    }
    $segments = explode('/', rtrim($normalized, '/'));
    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            return false;
        }
    }
    return true;
}

if ($zip->open($targetPath) === TRUE) {
    $fileCount = $zip->numFiles;
    for ($i = 0; $i < $fileCount; $i++) {
        $name = $zip->getNameIndex($i);
        if (!isSafeZipEntry($name)) {
            $zip->close();
            unlink($targetPath);
            respond_with_error(400, 'Archive contains unsafe paths');
        }
    }
    if (!$zip->extractTo($extractDir)) {
        $zip->close();
        unlink($targetPath);
        respond_with_error(500, 'Failed to extract scene');
    }
    $zip->close();
    $maybeFlattenRoot = function ($dir) {
        $contents = array_values(array_diff(scandir($dir), ['.', '..']));
        if (count($contents) !== 1) {
            return;
        }
        $single = $contents[0];
        $singlePath = $dir . DIRECTORY_SEPARATOR . $single;
        if (!is_dir($singlePath)) {
            return;
        }
        $innerItems = array_diff(scandir($singlePath), ['.', '..']);
        foreach ($innerItems as $inner) {
            $source = $singlePath . DIRECTORY_SEPARATOR . $inner;
            $target = $dir . DIRECTORY_SEPARATOR . $inner;
            if (file_exists($target)) {
                if (is_dir($target)) {
                    deleteDirectory($target);
                } else {
                    unlink($target);
                }
            }
            rename($source, $target);
        }
        rmdir($singlePath);
    };
    $maybeFlattenRoot($extractDir);
} else {
    unlink($targetPath);
    respond_with_error(500, 'Failed to extract scene');
}

// write manifest
$manifestPath = __DIR__ . '/default-scene.json';
$manifest = [
    'updatedAt' => time(),
    'size' => $file['size'],
    'version' => $file['name'] ?? 'scene'
];
file_put_contents($manifestPath, json_encode($manifest));

echo json_encode(['success' => true, 'manifest' => $manifest]);
