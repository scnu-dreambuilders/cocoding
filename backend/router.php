<?php
// backend/router.php
// Only used by `php -S` (local dev server). Apache/XAMPP deployments are
// protected by backend/.htaccess instead — this router exists because the
// built-in server ignores .htaccess entirely.
$path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// .env·SQL·문서, 숨김 파일(.rate_limit.json 등), 관리용 CLI 스크립트(tools/)는 차단
if (preg_match('/\.(env|sql|md)$/i', $path) || preg_match('#(^|/)\.#', $path) || preg_match('#^/tools(/|$)#i', $path)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    return true;
}

return false; // let the built-in server handle everything else as usual
