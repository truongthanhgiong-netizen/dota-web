<?php
declare(strict_types=1);

const SPREADSHEET_ID = '1gsdQCCCJzEWGS1UaO0yKBGh4ALW-yAIfIgRwIYu8vpc';
const CACHE_FILE = __DIR__ . '/../data/google-games-cache.json';
const CACHE_TTL_SECONDS = 86400;
const BAN_STYLE_IDS = ['4' => true];
const PICK_STYLE_IDS = ['7' => true];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

    if (!$forceRefresh && is_readable(CACHE_FILE) && time() - filemtime(CACHE_FILE) < CACHE_TTL_SECONDS) {
        readfile(CACHE_FILE);
        exit;
    }

    $xlsx = downloadWorkbook();
    $games = extractGames($xlsx);
    $payload = json_encode([
        'source' => 'google-sheets',
        'spreadsheetId' => SPREADSHEET_ID,
        'generatedAt' => gmdate('c'),
        'games' => $games,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    if ($payload === false) {
        throw new RuntimeException('Failed to encode JSON response.');
    }

    $cacheDir = dirname(CACHE_FILE);
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0775, true);
    }
    @file_put_contents(CACHE_FILE, $payload);

    echo $payload;
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => $error->getMessage(),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function downloadWorkbook(): string
{
    $url = 'https://docs.google.com/spreadsheets/d/' . SPREADSHEET_ID . '/export?format=xlsx';

    $content = false;
    if (ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 30,
                'header' => "User-Agent: dota-website/1.0\r\n",
            ],
        ]);
        $content = @file_get_contents($url, false, $context);
    }

    if ($content === false && function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'dota-website/1.0',
        ]);
        $content = curl_exec($curl);
        curl_close($curl);
    }

    if ($content === false || strlen($content) === 0) {
        throw new RuntimeException('Could not download the Google Sheet as XLSX. Make sure the sheet is publicly readable.');
    }

    return $content;
}

function extractGames(string $xlsx): array
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('PHP ZipArchive extension is required to read XLSX files.');
    }

    $tmp = tempnam(sys_get_temp_dir(), 'dota-xlsx-');
    if ($tmp === false) {
        throw new RuntimeException('Could not create a temporary file.');
    }

    file_put_contents($tmp, $xlsx);

    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) {
        @unlink($tmp);
        throw new RuntimeException('Downloaded file is not a valid XLSX archive.');
    }

    try {
        $sharedStrings = loadSharedStrings($zip);
        $relationships = loadRelationships($zip);
        $sheets = loadSheets($zip, $relationships);
        $games = [];

        foreach ($sheets as $sheet) {
            if (!preg_match('/^game \d+$/', $sheet['name'])) {
                continue;
            }

            $xml = zipRead($zip, 'xl/' . $sheet['target']);
            $worksheet = simplexml_load_string($xml);
            if ($worksheet === false) {
                continue;
            }

            $worksheet->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $cells = [];
            foreach ($worksheet->xpath('//m:c') ?: [] as $cell) {
                $ref = (string) $cell['r'];
                $cells[$ref] = $cell;
            }

            $events = [];
            foreach ($cells as $ref => $cell) {
                if (!preg_match('/^([EF])(\d+)$/', $ref, $match)) {
                    continue;
                }
                if ((int) $match[2] < 16) {
                    continue;
                }

                $hero = trim(cellValue($cell, $sharedStrings));
                if ($hero === '') {
                    continue;
                }

                $style = (string) $cell['s'];
                if (isset(BAN_STYLE_IDS[$style])) {
                    $events[] = ['type' => 'ban', 'cell' => $ref, 'name' => $hero];
                } elseif (isset(PICK_STYLE_IDS[$style])) {
                    $events[] = ['type' => 'pick', 'cell' => $ref, 'name' => $hero];
                }
            }

            usort($events, function (array $a, array $b): int {
                return cellSortValue($a['cell']) <=> cellSortValue($b['cell']);
            });

            $games[] = [
                'name' => $sheet['name'],
                'date' => formatDate(trim(cellValue($cells['B1'] ?? null, $sharedStrings))),
                'rawDate' => trim(cellValue($cells['B1'] ?? null, $sharedStrings)),
                'result' => trim(cellValue($cells['B2'] ?? null, $sharedStrings)),
                'matchId' => trim(cellValue($cells['B3'] ?? null, $sharedStrings)),
                'heroes' => $events,
            ];
        }

        usort($games, function (array $a, array $b): int {
            return gameNumber($a['name']) <=> gameNumber($b['name']);
        });

        return $games;
    } finally {
        $zip->close();
        @unlink($tmp);
    }
}

function zipRead(ZipArchive $zip, string $path): string
{
    $content = $zip->getFromName($path);
    if ($content === false) {
        throw new RuntimeException('Missing XLSX file: ' . $path);
    }
    return $content;
}

function loadSharedStrings(ZipArchive $zip): array
{
    $xml = $zip->getFromName('xl/sharedStrings.xml');
    if ($xml === false) {
        return [];
    }

    $root = simplexml_load_string($xml);
    if ($root === false) {
        return [];
    }

    $root->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $strings = [];
    foreach ($root->xpath('//m:si') ?: [] as $item) {
        $strings[] = collectTextNodes($item);
    }
    return $strings;
}

function loadRelationships(ZipArchive $zip): array
{
    $root = simplexml_load_string(zipRead($zip, 'xl/_rels/workbook.xml.rels'));
    if ($root === false) {
        throw new RuntimeException('Could not parse workbook relationships.');
    }

    $root->registerXPathNamespace('rel', 'http://schemas.openxmlformats.org/package/2006/relationships');
    $relationships = [];
    foreach ($root->xpath('//rel:Relationship') ?: [] as $relationship) {
        $relationships[(string) $relationship['Id']] = (string) $relationship['Target'];
    }
    return $relationships;
}

function loadSheets(ZipArchive $zip, array $relationships): array
{
    $workbook = simplexml_load_string(zipRead($zip, 'xl/workbook.xml'));
    if ($workbook === false) {
        throw new RuntimeException('Could not parse workbook XML.');
    }

    $workbook->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $workbook->registerXPathNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');

    $sheets = [];
    foreach ($workbook->xpath('//m:sheets/m:sheet') ?: [] as $sheet) {
        $attributes = $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        $rid = (string) $attributes['id'];
        if (!isset($relationships[$rid])) {
            continue;
        }
        $sheets[] = [
            'name' => (string) $sheet['name'],
            'target' => $relationships[$rid],
        ];
    }
    return $sheets;
}

function cellValue(?SimpleXMLElement $cell, array $sharedStrings): string
{
    if ($cell === null) {
        return '';
    }

    $type = (string) $cell['t'];
    if ($type === 'inlineStr') {
        return collectTextNodes($cell);
    }

    $children = $cell->children('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $raw = isset($children->v) ? (string) $children->v : '';
    if ($type === 's') {
        return $raw !== '' && isset($sharedStrings[(int) $raw]) ? $sharedStrings[(int) $raw] : '';
    }
    if ($type === 'b') {
        return $raw === '1' ? 'TRUE' : 'FALSE';
    }
    return $raw;
}

function collectTextNodes(SimpleXMLElement $element): string
{
    $element->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
    $text = '';
    foreach ($element->xpath('.//m:t') ?: [] as $node) {
        $text .= (string) $node;
    }
    return $text;
}

function formatDate(string $value): string
{
    if ($value === '' || !is_numeric($value)) {
        return $value;
    }

    $timestamp = strtotime('1899-12-30 UTC') + ((int) floor((float) $value) * 86400);
    return gmdate('Y-m-d', $timestamp);
}

function cellSortValue(string $cell): int
{
    if (!preg_match('/^([A-Z]+)(\d+)$/', $cell, $match)) {
        return 0;
    }
    return ((int) $match[2] * 100) + columnNumber($match[1]);
}

function columnNumber(string $column): int
{
    $number = 0;
    for ($i = 0; $i < strlen($column); $i++) {
        $number = ($number * 26) + ord($column[$i]) - 64;
    }
    return $number;
}

function gameNumber(string $name): int
{
    return preg_match('/^game (\d+)$/', $name, $match) ? (int) $match[1] : 0;
}
