function renderPlays4WeekChart(chartData) {
    if (!Array.isArray(chartData) || chartData.length === 0) return '';
    const maxCount = Math.max(1, ...chartData.map(d => d.count));
    const maxCountEntry = chartData.find(d => d.count === maxCount) || { key: 'N/A' };
    const totalPlays = chartData.reduce((s, d) => s + d.count, 0);
    const W = 420, H = 72;
    const slotW = 15, barW = 12, topPad = 4, baseY = H - 14, chartH = baseY - topPad;

    let bars = '';
    let labels = '';
    chartData.forEach((d, i) => {
        const x = i * slotW;
        const barH = d.count > 0 ? Math.max(2, Math.round((d.count / maxCount) * chartH)) : 0;
        const y = baseY - barH;
        bars += `<rect x="${x + 1.5}" y="${y}" width="${barW}" height="${barH}" fill="#8b5cf6" rx="1"/>`;
        if (i % 7 === 0) {
            const date = new Date(d.key + 'T12:00:00');
            const label = (date.getMonth() + 1) + '/' + date.getDate();
            labels += `<text x="${x + 7.5}" y="${H - 1}" text-anchor="middle" font-size="7" fill="#6b7280">${label}</text>`;
        }
    });

    return `
        <div class="mb-4 rounded-lg border border-violet-900/40 bg-gray-900/60 px-3 pt-3 pb-2">
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-semibold text-violet-300">📈 Last 4 Weeks</span>
                <span class="text-xs text-gray-500">${totalPlays} play${totalPlays !== 1 ? 's' : ''} &middot; max ${maxCount}/day (${maxCountEntry.key})</span>
            </div>
            <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:64px;" aria-hidden="true">
                <line x1="0" y1="${baseY}" x2="${W}" y2="${baseY}" stroke="#374151" stroke-width="1"/>
                ${bars}
                ${labels}
            </svg>
        </div>`;
}

window.renderPlaysTab = function renderPlaysTab({ playsData, chartData, allPlayers, escapeHTML, isValidImageUrl, getPlaceholderImageUrl, targetId = 'plays-table' }) {
    const recentPlays = playsData;
    let cardsHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">';

    function getPlayerKeyByName(name) {
        const normalizedName = String(name || '').trim().toLowerCase();
        if (!normalizedName || !Array.isArray(allPlayers)) {
            return null;
        }

        const match = allPlayers.find(function (player) {
            return String(player.name || '').trim().toLowerCase() === normalizedName;
        });

        return match && match.key ? String(match.key) : null;
    }

    function renderLinkedPlayerName(name, extraClass) {
        const safeName = escapeHTML(String(name || ''));
        const playerKey = getPlayerKeyByName(name);
        const className = extraClass ? ` class="${extraClass}"` : '';

        if (!playerKey) {
            return `<span${className}>${safeName}</span>`;
        }

        return `<a href="#playerstats/${encodeURIComponent(playerKey)}"${className}>${safeName}</a>`;
    }

    function renderLinkedPlayerList(names, extraClass) {
        if (!Array.isArray(names) || names.length === 0) {
            return '';
        }

        return names.map(function (name) {
            return renderLinkedPlayerName(name, extraClass);
        }).join('<span class="text-gray-700">, </span>');
    }

    function getGameLinkParts(play) {
        var game = play && play.game;
        if (game && game.id) {
            return {
                href: '#gamestats/' + encodeURIComponent(String(game.id)),
                attrs: '',
                isExternal: false
            };
        }

        var bggId = play && play.gameId ? String(play.gameId).trim().replace(/^bgg_/i, '') : '';
        if (bggId) {
            return {
                href: 'https://boardgamegeek.com/boardgame/' + encodeURIComponent(bggId) + '/',
                attrs: ' target="_blank" rel="noopener noreferrer"',
                isExternal: true
            };
        }

        return {
            href: '#',
            attrs: '',
            isExternal: false
        };
    }

    recentPlays.forEach(play => {
        const game = play.game;
        const placeholderSvg = typeof getPlaceholderImageUrl === 'function' ? getPlaceholderImageUrl() : '';
        const scores = Array.isArray(play.playerScores) ? play.playerScores : [];

        const uniquePlayerNames = [...new Set(scores
            .map(score => String(score.playerName || '').trim())
            .filter(name => name !== ''))];

        const winnerNames = [...new Set(scores
            .filter(score => score.winner === true || score.winner === 1 || score.winner === '1')
            .map(score => String(score.playerName || '').trim())
            .filter(name => name !== ''))];

        const coPlayersMarkup = uniquePlayerNames.length > 0
            ? renderLinkedPlayerList(uniquePlayerNames, 'text-gray-400 hover:text-gray-200 underline')
            : '<span>No data</span>';

        const winnersMarkup = winnerNames.length > 0
            ? renderLinkedPlayerList(winnerNames, 'text-amber-300 hover:text-amber-200 underline')
            : '<span>Unknown</span>';

        let thumbnailUrl = placeholderSvg;
        if (game && game.urlThumb && isValidImageUrl(game.urlThumb)) {
            thumbnailUrl = game.urlThumb;
        }
        const safeThumbnailUrl = escapeHTML(thumbnailUrl);
        const safePlaceholderUrl = escapeHTML(placeholderSvg);

        const gameLink = getGameLinkParts(play);

        cardsHTML += `
            <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 h-full">
                <div class="w-full h-32 bg-gray-700 flex items-center justify-center relative">
                    <img src="${safeThumbnailUrl}" alt="${escapeHTML(play.Game)}" class="max-w-full max-h-full object-contain" data-fallback-src="${safePlaceholderUrl}">
                    ${play.isNotOwned ? '<div class="absolute top-2 left-2 bg-red-600/90 text-white text-xs px-2 py-1 rounded font-semibold">Not Owned</div>' : ''}
                </div>
                <div class="p-4">
                    <h3 class="font-semibold text-lg mb-3 truncate text-gray-100"><a href="${gameLink.href}"${gameLink.attrs} class="text-blue-400 hover:text-blue-300 underline">${escapeHTML(play.Game)}</a>${gameLink.isExternal ? '<span class="ml-2 text-[11px] font-semibold text-cyan-300">BGG ↗</span>' : ''}</h3>
                    <div class="text-sm text-gray-400 space-y-2">
                        <p><span class="text-gray-500">📅 Date:</span> ${escapeHTML(play.Date)}</p>
                        <p><span class="text-gray-500">⏱️ Duration:</span> ${escapeHTML(play.Duration)} min</p>
                        <p><span class="text-gray-500">👥 Players:</span> ${coPlayersMarkup}</p>
                        <p><span class="text-gray-500">🏆 Winner:</span> ${winnersMarkup}</p>
                    </div>
                </div>
            </div>
        `;
    });

    cardsHTML += '</div>';
    document.getElementById(targetId).innerHTML = renderPlays4WeekChart(chartData) + cardsHTML;
};
