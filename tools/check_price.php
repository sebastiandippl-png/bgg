#!/usr/bin/env php
<?php
// Script to check board game prices using brettspielpreise.de API
// Usage: php check_price.php <bgg_game_id>

if ($argc < 2) {
    fwrite(STDERR, "Usage: php check_price.php <bgg_game_id>\n");
    exit(1);
}

$bgg_id = $argv[1];
$sitename = urlencode('https://example.com'); // Replace with your site if needed
$currency = 'EUR';
$destination = 'DE';
$locale = 'en';

$url = "https://brettspielpreise.de/api/info?eid={$bgg_id}&currency={$currency}&destination={$destination}&locale={$locale}&sitename={$sitename}";

$response = file_get_contents($url);
if ($response === false) {
    fwrite(STDERR, "Failed to fetch data from API.\n");
    exit(2);
}

$data = json_decode($response, true);
if (!$data || !isset($data['items']) || count($data['items']) === 0) {
    fwrite(STDERR, "No data found for BGG ID {$bgg_id}.\n");
    exit(3);
}


$item = $data['items'][0];
echo "\n=== " . ($item['name'] ?? 'Unknown Game') . " ===\n";
echo "BGG ID: " . ($item['external_id'] ?? '-') . "\n";
echo "Brettspielpreise Link: " . ($item['url'] ?? '-') . "\n";
echo "Image: " . ($item['image'] ?? '-') . "\n";
echo str_repeat('-', 40) . "\n";
if (!empty($item['prices'])) {
    printf("%-35s %-8s %-8s %-8s %-8s %-8s\n", 'Shop', 'Price', 'Product', 'Shipping', 'Stock', 'Link');
    $count = 0;
    foreach ($item['prices'] as $offer) {
        if ($count++ >= 3) break;
        $shop = $offer['sitename'] ?? '-';
        $price = number_format($offer['price'], 2) . ' ' . $data['currency'];
        $product = number_format($offer['product'], 2) . ' ' . $data['currency'];
        $shipping = $offer['shipping_known'] ? number_format($offer['shipping'], 2) . ' ' . $data['currency'] : '?';
        $stock = $offer['stock'] ?? '?';
        $link = $offer['link'] ?? '-';
        printf("%-35s %-8s %-8s %-8s %-8s %-8s\n", $shop, $price, $product, $shipping, $stock, $link);
    }
} else {
    echo "No offers found.\n";
}
echo "\n";
