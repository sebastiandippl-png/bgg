#!/usr/bin/env php
<?php

/**
 * Funtainment Price Scraper
 * 
 * Takes a game name as input and shows top 5 prices on funtainment.de
 * 
 * Usage: php funtainment_price_scraper.php "game name"
 */

if ($argc < 2) {
    echo "Usage: php funtainment_price_scraper.php \"game name\" [--debug]\n";
    echo "Example: php funtainment_price_scraper.php \"Koi\"\n";
    exit(1);
}

$gameName = $argv[1];
$debug = in_array('--debug', $argv);
$searchUrl = "https://funtainment.de/suggest?search=" . urlencode($gameName);

// Fetch search results
$searchHtml = fetchUrl($searchUrl);
if (!$searchHtml) {
    echo "Error: Could not fetch search page\n";
    exit(1);
}

// Find top 5 product links
$products = extractProductLinks($searchHtml, 5);
if (empty($products)) {
    if ($debug) {
        echo "[DEBUG] Search response (first 2000 chars):\n";
        echo substr($searchHtml, 0, 2000) . "\n\n";
    }
    echo "No products found for \"$gameName\"\n";
    exit(1);
}

// Fetch prices for each product
$results = [];
foreach ($products as $product) {
    $link = $product['link'];
    // Make sure it's a full URL
    if (strpos($link, 'http') !== 0) {
        $link = "https://funtainment.de" . $link;
    }
    
    // Fetch product page
    $productHtml = fetchUrl($link);
    if (!$productHtml) {
        continue;
    }
    
    // Extract price and currency
    $price = extractMetaContent($productHtml, 'product:price:amount');
    $currency = extractMetaContent($productHtml, 'product:price:currency');
    $pageLink = extractMetaContent($productHtml, 'product:product_link');
    
    // Use the provided link or fallback to what we fetched
    if (empty($pageLink)) {
        $pageLink = $link;
    }
    
    $results[] = [
        'title' => $product['title'],
        'price' => $price,
        'currency' => $currency ?: 'EUR',
        'link' => $pageLink
    ];
}

// Output results
if (empty($results)) {
    echo "Could not fetch prices for any products\n";
    exit(1);
}

echo "Top " . count($results) . " results for \"$gameName\":\n";
echo str_repeat("-", 120) . "\n";

foreach ($results as $index => $result) {
    $priceStr = $result['price'] ? number_format((float)$result['price'], 2, ',', '') . " " . $result['currency'] : "N/A";
    echo ($index + 1) . ". " . $result['title'] . "\n";
    echo "   Price: $priceStr\n";
    echo "   Link:  " . $result['link'] . "\n";
    echo "\n";
}

/**
 * Fetch URL content using cURL
 */
function fetchUrl($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if ($httpCode !== 200 || !$response) {
        return null;
    }
    
    return $response;
}

/**
 * Extract product links and titles from search results
 * Returns up to $limit products with [Erweiterung] included
 */
function extractProductLinks($html, $limit = 5) {
    $products = [];
    
    // Find all product list items
    if (preg_match_all('#<li[^>]*class="[^"]*search-suggest-product[^"]*js-result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*title="([^"]*)"#', $html, $matches)) {
        // $matches[1] contains hrefs, $matches[2] contains titles
        for ($i = 0; $i < count($matches[1]) && count($products) < $limit; $i++) {
            $products[] = [
                'link' => $matches[1][$i],
                'title' => $matches[2][$i]
            ];
        }
    }
    
    // Also try alternative pattern if title comes first
    if (count($products) < $limit && preg_match_all('#<li[^>]*search-suggest-product[\s\S]*?<a[^>]*title="([^"]*)"[^>]*href="([^"]*)"#', $html, $matches)) {
        for ($i = 0; $i < count($matches[1]) && count($products) < $limit; $i++) {
            // Check if we already have this link
            $link = $matches[2][$i];
            $exists = false;
            foreach ($products as $p) {
                if ($p['link'] === $link) {
                    $exists = true;
                    break;
                }
            }
            if (!$exists) {
                $products[] = [
                    'link' => $link,
                    'title' => $matches[1][$i]
                ];
            }
        }
    }
    
    return $products;
}

/**
 * Extract meta tag content by property name
 */
function extractMetaContent($html, $property) {
    $pattern = '#<meta\s+property="' . preg_quote($property) . '"[^>]*content="([^"]*)"#';
    if (preg_match($pattern, $html, $matches)) {
        return $matches[1];
    }
    
    // Try reversed order (content before property)
    $pattern = '#<meta\s+content="([^"]*)"[^>]*property="' . preg_quote($property) . '"#';
    if (preg_match($pattern, $html, $matches)) {
        return $matches[1];
    }
    
    return null;
}
