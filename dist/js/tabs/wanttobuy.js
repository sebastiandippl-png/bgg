window.renderWantToBuyTab = function renderWantToBuyTab(options) {
    var games = Array.isArray(options.games) ? options.games : [];
    var wantToPlayGames = Array.isArray(options.wantToPlayGames) ? options.wantToPlayGames : [];
    var escapeHTML = options.escapeHTML;
    var isValidImageUrl = options.isValidImageUrl;
    var getPlaceholderImageUrl = options.getPlaceholderImageUrl;
    var targetId = options.targetId || 'wanttobuy-content';
    var container = document.getElementById(targetId);

    if (!container) {
        return;
    }

    function sortCardsByPrice() {
        var grid = container.querySelector('[data-wanttobuy-grid]');
        if (!grid) {
            return;
        }

        var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-wanttobuy-card]'));
        cards.sort(function (firstCard, secondCard) {
            var firstPrice = Number(firstCard.getAttribute('data-sort-price'));
            var secondPrice = Number(secondCard.getAttribute('data-sort-price'));

            var firstValue = Number.isFinite(firstPrice) ? firstPrice : -1;
            var secondValue = Number.isFinite(secondPrice) ? secondPrice : -1;
            if (secondValue !== firstValue) {
                return secondValue - firstValue;
            }

            var firstName = String(firstCard.getAttribute('data-sort-name') || '');
            var secondName = String(secondCard.getAttribute('data-sort-name') || '');
            return firstName.localeCompare(secondName);
        });

        cards.forEach(function (card) {
            grid.appendChild(card);
        });
    }

    function renderCollectionBadges(game) {
        var badges = [
            { active: game.owned, label: 'owned', className: 'bg-emerald-900/50 text-emerald-400' },
            { active: game.prevOwned, label: 'prevOwned', className: 'bg-rose-900/50 text-rose-300' },
            { active: game.forTrade, label: 'forTrade', className: 'bg-sky-900/50 text-sky-300' },
            { active: game.want, label: 'want', className: 'bg-violet-900/50 text-violet-300' },
            { active: game.wantToPlay, label: 'wantToPlay', className: 'bg-cyan-900/50 text-cyan-300' },
            { active: game.wantToBuy, label: 'wantToBuy', className: 'bg-amber-900/50 text-amber-300' },
            { active: game.wishlist, label: 'wishlist', className: 'bg-fuchsia-900/50 text-fuchsia-300' },
            { active: game.preordered, label: 'preordered', className: 'bg-indigo-900/50 text-indigo-300' }
        ];

        return badges
            .filter(function (badge) { return badge.active; })
            .map(function (badge) {
                return '<span class="text-[11px] px-2 py-0.5 rounded ' + badge.className + '">' + escapeHTML(badge.label) + '</span>';
            })
            .join('');
    }

    function renderValue(value, suffix) {
        if (value === null || value === undefined || value === '') {
            return '<span class="text-gray-600">-</span>';
        }
        return escapeHTML(String(value)) + (suffix ? suffix : '');
    }

    function renderGameCard(game, showPrice) {
        var placeholderSvg = typeof getPlaceholderImageUrl === 'function' ? getPlaceholderImageUrl() : '';
        var thumbnailUrl = game.urlThumb && isValidImageUrl(game.urlThumb) ? game.urlThumb : placeholderSvg;
        var safeThumbnailUrl = escapeHTML(thumbnailUrl);
        var safePlaceholderUrl = escapeHTML(placeholderSvg);
        var statsUrl = game.id ? '#gamestats/' + encodeURIComponent(String(game.id)) : '#';
        var bggUrl = game.bggId ? 'https://boardgamegeek.com/boardgame/' + escapeHTML(String(game.bggId)) + '/' : null;
        var priceRowId = 'wanttobuy-price-row-' + escapeHTML(String(game.bggId || game.id || ''));
        var priceRow = showPrice !== false
            ? '<div class="flex justify-between gap-3" id="' + priceRowId + '"><dt class="text-gray-500">Best Price</dt><dd class="text-gray-400 text-right text-xs italic">loading...</dd></div>'
            : '';

        return '<article class="rounded-lg border border-gray-700 bg-gray-900/40 p-3 shadow-sm" data-wanttobuy-card data-sort-price="-1" data-sort-name="' + escapeHTML(String(game.name || '')) + '">'
            + '<div class="flex items-start gap-3">'
            + '<a href="' + statsUrl + '" class="shrink-0 w-14 h-14 rounded-md border border-gray-700 bg-gray-800 overflow-hidden flex items-center justify-center p-1">'
            + '<img src="' + safeThumbnailUrl + '" alt="' + escapeHTML(game.name) + '" class="max-w-full max-h-full object-contain" loading="lazy" data-fallback-src="' + safePlaceholderUrl + '">'
            + '</a>'
            + '<div class="min-w-0 flex-1">'
            + '<div class="flex items-start justify-between gap-2">'
            + '<div class="min-w-0">'
            + '<a href="' + statsUrl + '" class="text-sm font-semibold text-blue-400 hover:text-blue-300 underline break-words">' + escapeHTML(String(game.name || 'Unknown')) + '</a>'
            + '<div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">'
            + (game.year ? '<span>' + escapeHTML(String(game.year)) + '</span>' : '')
            + (bggUrl ? '<a href="' + bggUrl + '" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300">BGG</a>' : '')
            + '</div>'
            + '</div>'
            + '<div class="shrink-0 text-right">'
            + '<div class="text-[11px] text-gray-500">Geek</div>'
            + '<div class="text-sm font-medium text-gray-200">' + renderValue(game.geekRating) + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="mt-2 flex flex-wrap gap-1.5">' + renderCollectionBadges(game) + '</div>'
            + '<dl class="mt-3 space-y-1.5 text-sm">'
            + '<div class="flex justify-between gap-3"><dt class="text-gray-500">Last Played</dt><dd class="text-gray-200 text-right">' + renderValue(game.lastPlayed) + '</dd></div>'
            + priceRow
            + '</dl>'
            + '</div>'
            + '</div>'
            + '</article>';
    }

    function applyPriceResult(rowId, json) {
        var row = document.getElementById(rowId);
        if (!row) {
            return;
        }

        var priceCell = row.querySelector('dd');
        if (!priceCell) {
            return;
        }

        if (!json.success || !json.price) {
            row.closest('[data-wanttobuy-card]').setAttribute('data-sort-price', '-1');
            priceCell.innerHTML = '<span class="text-gray-600">-</span>';
            sortCardsByPrice();
            return;
        }

        var price = json.price;
        var numericPrice = Number(price.price);
        var priceText = (price.price !== null && price.price !== undefined)
            ? Number(price.price).toFixed(2) + ' ' + (price.currency || 'EUR')
            : '-';
        var stockBadge = '';
        if (price.stock === 'Y') {
            stockBadge = '<span class="ml-1 text-emerald-400 text-xs">in stock</span>';
        } else if (price.stock === 'N') {
            stockBadge = '<span class="ml-1 text-rose-400 text-xs">out of stock</span>';
        } else if (price.stock === 'P') {
            stockBadge = '<span class="ml-1 text-amber-400 text-xs">pre-order</span>';
        }

        var linkUrl = price.item_url || null;
        var priceHtml = linkUrl
            ? '<a href="' + linkUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">' + priceText + '</a>'
            : '<span class="text-gray-200">' + priceText + '</span>';
        var sourceUrl = price.item_url || 'https://brettspielpreise.de';

        row.closest('[data-wanttobuy-card]').setAttribute('data-sort-price', Number.isFinite(numericPrice) ? String(numericPrice) : '-1');

        priceCell.innerHTML = priceHtml + stockBadge
            + '<span class="block text-[10px] text-gray-600 mt-0.5">via <a href="' + sourceUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="hover:text-gray-400 underline">brettspielpreise.de</a></span>';
        sortCardsByPrice();
    }

    function loadPrices(items) {
        var queue = items.filter(function (game) {
            return game && game.bggId;
        }).slice();
        var maxConcurrent = 4;
        var inFlight = 0;

        function scheduleNext() {
            while (inFlight < maxConcurrent && queue.length > 0) {
                (function (game) {
                    var rowId = 'wanttobuy-price-row-' + String(game.bggId || game.id || '');
                    inFlight += 1;
                    fetch('api/get_game_price.php?bgg_id=' + encodeURIComponent(String(game.bggId)))
                        .then(function (response) { return response.json(); })
                        .then(function (json) { applyPriceResult(rowId, json); })
                        .catch(function () {
                            applyPriceResult(rowId, { success: false });
                        })
                        .finally(function () {
                            inFlight -= 1;
                            scheduleNext();
                        });
                })(queue.shift());
            }
        }

        scheduleNext();
    }

    if (games.length === 0 && wantToPlayGames.length === 0) {
        container.innerHTML = '<div class="rounded-lg border border-gray-700 bg-gray-900/40 p-6 text-sm text-gray-400">No games are currently marked wantToBuy or wantToPlay.</div>';
        return;
    }

    var buySection = games.length > 0
        ? '<div class="mb-5 rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">'
            + '<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">'
            + '<div>'
            + '<h2 class="text-lg font-semibold text-amber-200">WantToBuy</h2>'
            + '<p class="text-sm text-amber-100/80">Games marked want_to_buy, with cached price data.</p>'
            + '</div>'
            + '<div class="text-sm text-amber-300">' + escapeHTML(String(games.length)) + ' games</div>'
            + '</div>'
            + '<p class="text-sm text-amber-100/80">More Prices: <a href="https://www.brettspiel-angebote.de/merkliste/" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">BrettspielAngebote.de</a></p>'
            + '</div>'
            + '</div>'
            + '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-8" data-wanttobuy-grid>'
            + games.map(function(g) { return renderGameCard(g, true); }).join('')
            + '</div>'
        : '';

    var playSection = wantToPlayGames.length > 0
        ? '<div class="mb-5 rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-4">'
            + '<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">'
            + '<div>'
            + '<h2 class="text-lg font-semibold text-cyan-200">WantToPlay</h2>'
            + '<p class="text-sm text-cyan-100/80">Games marked want_to_play.</p>'
            + '</div>'
            + '<div class="text-sm text-cyan-300">' + escapeHTML(String(wantToPlayGames.length)) + ' games</div>'
            + '</div>'
            + '</div>'
            + '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3" data-wanttoplay-grid>'
            + wantToPlayGames.map(function(g) { return renderGameCard(g, true); }).join('')
            + '</div>'
        : '';

    container.innerHTML = buySection + playSection;

    loadPrices(games);
    loadPrices(wantToPlayGames);
};