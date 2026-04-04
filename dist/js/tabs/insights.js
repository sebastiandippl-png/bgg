window.renderInsightsTab = function renderInsightsTab({ insightsData, allPlayers, escapeHTML, isValidImageUrl, getPlaceholderImageUrl, targetId = 'content-insights' }) {
    const {
        hIndex,
        totalPlays,
        baseOwnedGames,
        ownedExpansions,
        nearMissGames,
        exactGames,
        latestOwnedPurchase,
        lastModifiedGame,
        anneVsSeb
    } = insightsData;
    const placeholderSvg = typeof getPlaceholderImageUrl === 'function' ? getPlaceholderImageUrl() : '';

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

    const hIndexNearMissMarkup = hIndex > 0 && nearMissGames.length > 0
        ? `<p class="text-xs text-gray-500 mt-3">Closest below your h-index: ${escapeHTML(nearMissGames.map(game => `${game.name} (${game.playCount})`).join(', '))}</p>`
        : '<p class="text-xs text-gray-500 mt-3">No games found below your h-index.</p>';

    const hIndexExactMarkup = hIndex > 0 && exactGames.length > 0
        ? `<p class="text-xs text-gray-400 mt-2">Exactly your h-index: ${escapeHTML(exactGames.map(game => `${game.name} (${game.playCount})`).join(', '))}</p>`
        : '<p class="text-xs text-gray-500 mt-2">No games found with exactly your h-index.</p>';

    const lastModifiedThumb = lastModifiedGame && lastModifiedGame.urlThumb && isValidImageUrl(lastModifiedGame.urlThumb)
        ? lastModifiedGame.urlThumb
        : placeholderSvg;
    const lastModifiedUrl = lastModifiedGame && lastModifiedGame.id
        ? `#gamestats/${encodeURIComponent(lastModifiedGame.id)}`
        : null;

    const lastModifiedMarkup = lastModifiedGame
        ? `
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-4">Last Added</h3>
            <a href="${lastModifiedUrl || '#'}" class="block hover:no-underline">
            <div class="w-full h-40 bg-gray-700 rounded mb-4 flex items-center justify-center overflow-hidden">
                <img src="${lastModifiedThumb}" alt="${escapeHTML(lastModifiedGame.name)}" class="max-w-full max-h-full object-contain">
            </div>
            <p class="text-xl font-bold text-yellow-400">${escapeHTML(lastModifiedGame.name)}</p>
            <p class="text-xs text-gray-500 mt-2">Added: ${escapeHTML(lastModifiedGame.bggLastModified)}</p>
            </a>
        </div>`
        : `
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Last Added</h3>
            <p class="text-sm text-gray-500">No added games found.</p>
        </div>`;

    const anneWinsHighlight = anneVsSeb && anneVsSeb.leader === 'anne'
        ? 'text-emerald-400 font-bold'
        : 'text-gray-200';
    const sebWinsHighlight = anneVsSeb && anneVsSeb.leader === 'sebastian'
        ? 'text-emerald-400 font-bold'
        : 'text-gray-200';
    const anneVsSebLeaderClass = anneVsSeb && anneVsSeb.leader
        ? 'text-emerald-300 font-semibold'
        : 'text-gray-300';

    const anneVsSebMarkup = `
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Anne vs. Sebastian</h3>
            <p class="text-xs text-gray-500 mb-4">Last ${escapeHTML(anneVsSeb.windowDays || 30)} days, only plays with exactly Anne + Sebastian</p>
            <p class="text-4xl font-bold text-cyan-400">${escapeHTML(anneVsSeb.playsCount)}</p>
            <p class="text-xs text-gray-500 mt-1 mb-4">Number of plays</p>
            <div class="space-y-1 text-sm">
                <p>${renderLinkedPlayerName('Anne', 'text-gray-200 hover:text-blue-300 underline')} Wins: <span class="${anneWinsHighlight}">${escapeHTML(anneVsSeb.anneWins)}</span></p>
                <p>${renderLinkedPlayerName('Sebastian', 'text-gray-200 hover:text-blue-300 underline')} Wins: <span class="${sebWinsHighlight}">${escapeHTML(anneVsSeb.sebastianWins)}</span></p>
                <p class="mt-2">Winner: <span class="${anneVsSebLeaderClass}">${escapeHTML(anneVsSeb.leaderLabel || 'Currently tied')}</span></p>
            </div>
        </div>`;

    document.getElementById(targetId).innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Your H-Index</h3>
            <p class="text-5xl font-bold text-blue-500">${escapeHTML(hIndex)}</p>
            <p class="text-xs text-gray-500 mt-2">You have ${escapeHTML(hIndex)} games played at least ${escapeHTML(hIndex)} times.</p>
            ${hIndexNearMissMarkup}
            ${hIndexExactMarkup}
        </div>
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Plays Recorded</h3>
            <p class="text-5xl font-bold text-green-400">${escapeHTML(totalPlays)}</p>
        </div>
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Owned Games</h3>
            <p class="text-5xl font-bold text-purple-400">${escapeHTML(baseOwnedGames)}</p>
            <p class="text-xs text-gray-500 mt-2">Only base games currently owned.</p>
        </div>
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
            <h3 class="text-gray-400 text-sm uppercase tracking-wider mb-2">Owned Expansions</h3>
            <p class="text-5xl font-bold text-indigo-400">${escapeHTML(ownedExpansions)}</p>
            <p class="text-xs text-gray-500 mt-2">Only expansions currently owned.</p>
        </div>
        ${anneVsSebMarkup}
        ${lastModifiedMarkup}
        </div>
    `;
};
