window.renderPlaysTab = function renderPlaysTab({ playsData, escapeHTML, isValidImageUrl, getPlaceholderImageUrl, targetId = 'plays-table' }) {
    const recentPlays = playsData;
    let cardsHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">';

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

        const coPlayersText = uniquePlayerNames.length > 0
            ? uniquePlayerNames.join(', ')
            : 'No data';

        const winnersText = winnerNames.length > 0
            ? winnerNames.join(', ')
            : 'Unknown';

        let thumbnailUrl = placeholderSvg;
        if (game && game.urlThumb && isValidImageUrl(game.urlThumb)) {
            thumbnailUrl = game.urlThumb;
        }
        const safeThumbnailUrl = escapeHTML(thumbnailUrl);
        const safePlaceholderUrl = escapeHTML(placeholderSvg);

        const statsUrl = game && game.id ? `#gamestats/${encodeURIComponent(game.id)}` : '#';

        cardsHTML += `
            <a href="${statsUrl}" class="block hover:no-underline">
                <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 cursor-pointer h-full">
                    <div class="w-full h-32 bg-gray-700 flex items-center justify-center">
                        <img src="${safeThumbnailUrl}" alt="${escapeHTML(play.Game)}" class="max-w-full max-h-full object-contain" data-fallback-src="${safePlaceholderUrl}">
                    </div>
                    <div class="p-4">
                        <h3 class="font-semibold text-lg mb-3 truncate text-gray-100 text-blue-400 hover:text-blue-300">${escapeHTML(play.Game)}</h3>
                        <div class="text-sm text-gray-400 space-y-2">
                            <p><span class="text-gray-500">📅 Date:</span> ${escapeHTML(play.Date)}</p>
                            <p><span class="text-gray-500">⏱️ Duration:</span> ${escapeHTML(play.Duration)} min</p>
                            <p><span class="text-gray-500">👥 Players:</span> ${escapeHTML(coPlayersText)}</p>
                            <p><span class="text-gray-500">🏆 Winner:</span> ${escapeHTML(winnersText)}</p>
                        </div>
                    </div>
                </div>
            </a>
        `;
    });

    cardsHTML += '</div>';
    document.getElementById(targetId).innerHTML = cardsHTML;
};
