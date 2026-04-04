window.renderMostPlayedTab = function renderMostPlayedTab(options) {
    var mostPlayedData = options.mostPlayedData || { years: [], last365Days: { games: [] }, overall: { games: [] } };
    var escapeHTML = options.escapeHTML;
    var targetId = options.targetId || 'mostplayed-content';

    var container = document.getElementById(targetId);
    if (!container) { return; }

    var years = Array.isArray(mostPlayedData.years) ? mostPlayedData.years : [];
    var last365Days = mostPlayedData.last365Days || { label: 'Last 365 Days', games: [] };
    var last365Rows = Array.isArray(last365Days.games) ? last365Days.games : [];
    var overall = mostPlayedData.overall || { label: 'Overall', games: [] };
    var overallRows = Array.isArray(overall.games) ? overall.games : [];

    if (years.length === 0 && last365Rows.length === 0 && overallRows.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-400">No play data available.</div>';
        return;
    }

    function splitByWeight(rows) {
        return rows.reduce(function (acc, game) {
            var weight = Number(game && game.weight);
            if (Number.isFinite(weight) && weight > 3) {
                acc.heavy.push(game);
            } else if (Number.isFinite(weight) && weight > 1.8) {
                acc.medium.push(game);
            } else {
                acc.light.push(game);
            }
            return acc;
        }, {
            heavy: [],
            medium: [],
            light: []
        });
    }

    function renderGameRow(game, rank) {
        var gameName = escapeHTML(String(game.gameName || 'Unknown Game'));
        var gameLink = game.gameId
            ? '<a href="#gamestats/' + encodeURIComponent(String(game.gameId)) + '" class="text-gray-100 hover:text-blue-300 underline">' + gameName + '</a>'
            : '<span class="text-gray-100">' + gameName + '</span>';
        var winnerBadge = rank === 1
            ? '<span class="ml-2 text-amber-300" aria-label="winner">🏆</span>'
            : '';

        return '<div class="flex items-center gap-3 py-1.5 border-b border-gray-700/40 last:border-0">'
            + '<span class="w-6 text-right text-xs text-gray-500 tabular-nums">' + rank + '.</span>'
            + '<span class="flex-1 min-w-0 truncate">' + gameLink + winnerBadge + '</span>'
            + '<span class="text-xs text-fuchsia-300 font-semibold tabular-nums">' + escapeHTML(String(game.playCount)) + ' plays</span>'
            + '</div>';
    }

    function renderListBlock(title, rows, options) {
        var maxEntries = Number(options && options.maxEntries);
        var limitedRows = Number.isFinite(maxEntries) && maxEntries > 0 ? rows.slice(0, maxEntries) : rows;

        if (limitedRows.length === 0) {
            return '<div class="rounded border border-gray-700/50 p-3">'
                + '<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">' + escapeHTML(title) + '</h4>'
                + '<div class="text-xs text-gray-600 italic">No entries.</div>'
                + '</div>';
        }

        return '<div class="rounded border border-gray-700/50 p-3">'
            + '<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">' + escapeHTML(title) + '</h4>'
            + limitedRows.map(function (game, index) {
                return renderGameRow(game, index + 1);
            }).join('')
            + '</div>';
    }

    var topSplit = splitByWeight(last365Rows);
    var topCardListMarkup = '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
        + renderListBlock('Weight > 3', topSplit.heavy, { maxEntries: 10 })
        + renderListBlock('Weight > 1.8 and <= 3', topSplit.medium, { maxEntries: 10 })
        + renderListBlock('Weight <= 1.8', topSplit.light, { maxEntries: 10 })
        + '</div>';

    var topCard = '<section class="rounded-lg border border-amber-700/40 bg-amber-900/10 p-4">'
        + '<h3 class="text-sm font-semibold uppercase tracking-wider text-amber-300 mb-3">' + escapeHTML(String(last365Days.label || 'Last 365 Days')) + '</h3>'
        + '<p class="text-xs text-amber-200/80 mb-3">'
        + escapeHTML(String(last365Days.totalPlays || 0)) + ' plays · '
        + escapeHTML(String(last365Days.uniqueGames || 0)) + ' unique games'
        + '</p>'
        + '<div>' + topCardListMarkup + '</div>'
        + '</section>';

    var overallSplit = splitByWeight(overallRows);
    var overallCardListMarkup = '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
        + renderListBlock('Weight > 3', overallSplit.heavy, { maxEntries: 10 })
        + renderListBlock('Weight > 1.8 and <= 3', overallSplit.medium, { maxEntries: 10 })
        + renderListBlock('Weight <= 1.8', overallSplit.light, { maxEntries: 10 })
        + '</div>';

    var overallCard = '<section class="rounded-lg border border-gray-700 bg-gray-900/30 p-4">'
        + '<h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">' + escapeHTML(String(overall.label || 'Overall')) + '</h3>'
        + '<p class="text-xs text-gray-500 mb-3">'
        + escapeHTML(String(overall.totalPlays || 0)) + ' plays · '
        + escapeHTML(String(overall.uniqueGames || 0)) + ' unique games'
        + '</p>'
        + '<div>' + overallCardListMarkup + '</div>'
        + '</section>';

    var cards = years.map(function (yearEntry) {
        var rows = Array.isArray(yearEntry.games) ? yearEntry.games : [];
        var split = splitByWeight(rows);
        var yearLists = '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
            + renderListBlock('Weight > 3', split.heavy, { maxEntries: 10 })
            + renderListBlock('Weight > 1.8 and <= 3', split.medium, { maxEntries: 10 })
            + renderListBlock('Weight <= 1.8', split.light, { maxEntries: 10 })
            + '</div>';

        return '<section class="rounded-lg border border-gray-700 bg-gray-900/30 p-4">'
            + '<h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">'
            + escapeHTML(String(yearEntry.year))
            + '</h3>'
            + '<p class="text-xs text-gray-500 mb-3">'
            + escapeHTML(String(yearEntry.totalPlays || 0)) + ' plays · '
            + escapeHTML(String(yearEntry.uniqueGames || 0)) + ' unique games'
            + '</p>'
            + '<div>' + yearLists + '</div>'
            + '</section>';
    }).join('');

    container.innerHTML = '<div class="space-y-4">' + topCard + overallCard + cards + '</div>';
};
