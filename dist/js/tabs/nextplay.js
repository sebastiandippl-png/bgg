window.renderNextplayTab = function renderNextplayTab({ groups, randomPickIdsByGroupId = {}, escapeHTML, targetId = 'nextplay-content' }) {

    function getGameCountLabel(count) {
        return `${count} ${count === 1 ? 'game' : 'games'}`;
    }

    function pickRandomGame(games) {
        if (!Array.isArray(games) || games.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * games.length);
        return games[randomIndex] || null;
    }

    function renderOnceUponDateLink(dateValue) {
        const normalizedDate = String(dateValue || '').trim();
        if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(normalizedDate)) {
            return escapeHTML(normalizedDate || 'Never played');
        }

        return `<a href="#onceupon/${encodeURIComponent(normalizedDate)}" class="text-cyan-300 hover:text-cyan-200 underline">${escapeHTML(normalizedDate)}</a>`;
    }

    function generateNextplayCardsHTML(dataArray) {
        if (dataArray.length === 0) {
            return `<div class="p-4 text-gray-500 italic">🗂️ No games found in this category.</div>`;
        }

        let html = '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3">';

        dataArray.forEach(row => {
            const statsUrl = row.id ? `#gamestats/${encodeURIComponent(row.id)}` : '#';
            const minPlayers = row.minPlayers;
            const maxPlayers = row.maxPlayers;
            const playerCountDisplay = Number.isNaN(minPlayers) || Number.isNaN(maxPlayers)
                ? '-'
                : (minPlayers === maxPlayers ? `${minPlayers}` : `${minPlayers}-${maxPlayers}`);
            const lastPlayedDisplay = (row.lastPlayed === null || row.lastPlayed === '') ? 'Never played' : row.lastPlayed;
            const weightDisplay = row.weight ? row.weight : '-';
            const bestWithDisplay = row.bestWith && String(row.bestWith).trim() !== '' ? row.bestWith : '-';
            const recommendedWithDisplay = row.recommendedWith && String(row.recommendedWith).trim() !== '' ? row.recommendedWith : '-';
            const thumb = row.urlThumb ? String(row.urlThumb) : '';

            html += `<article class="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
                <div class="flex items-start gap-3 min-h-[64px]">
                    <div class="w-14 h-14 shrink-0 rounded border border-gray-700 bg-gray-900/70 overflow-hidden flex items-center justify-center p-1">
                        ${thumb
                            ? `<img src="${escapeHTML(thumb)}" alt="${escapeHTML(row.name)}" class="max-w-full max-h-full object-contain" loading="lazy">`
                            : '<span class="text-[10px] text-gray-500">No Image</span>'}
                    </div>
                    <div class="min-w-0 flex-1">
                        <a href="${statsUrl}" class="text-blue-400 hover:text-blue-300 transition underline font-semibold text-sm break-words">
                            ${escapeHTML(row.name)}
                        </a>
                        <div class="mt-2 text-xs text-gray-300 space-y-1">
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Players</span>
                                <span>${escapeHTML(playerCountDisplay)}</span>
                            </div>
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Last played</span>
                                <span>${renderOnceUponDateLink(lastPlayedDisplay)}</span>
                            </div>
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">BGG Weight</span>
                                <span>${escapeHTML(weightDisplay)}</span>
                            </div>
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Best with</span>
                                <span class="text-right">${escapeHTML(bestWithDisplay)}</span>
                            </div>
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Recommended with</span>
                                <span class="text-right">${escapeHTML(recommendedWithDisplay)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </article>`;
        });

        html += '</div>';
        return html;
    }

    function generateRandomPicksHTML(groupArray, selectedIdsByGroupId) {
        const picks = groupArray
            .map(group => {
                const games = group.games || [];
                const selectedId = selectedIdsByGroupId && selectedIdsByGroupId[group.id]
                    ? String(selectedIdsByGroupId[group.id])
                    : null;
                const selectedGame = selectedId
                    ? games.find(game => String(game.id || '') === selectedId)
                    : null;

                return {
                    id: group.id,
                    title: group.title,
                    titleClass: group.titleClass,
                    game: selectedGame || pickRandomGame(games)
                };
            })
            .filter(entry => entry.game);

        if (picks.length === 0) {
            return '';
        }

        return `
            <div class="mb-6 bg-gray-900 rounded-lg border border-gray-700 p-4">
                <h3 class="text-lg font-semibold text-gray-100 mb-3">Random pick per category</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    ${picks.map(entry => {
                        const game = entry.game;
                        const statsUrl = game.id ? `#gamestats/${encodeURIComponent(game.id)}` : '#';
                        const thumb = game.urlThumb ? String(game.urlThumb) : '';
                        return `
                            <article class="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
                                <p class="text-xs font-semibold ${entry.titleClass} mb-2">${escapeHTML(entry.title)}</p>
                                <div class="flex items-start gap-3 min-h-[56px]">
                                    <div class="w-12 h-12 shrink-0 rounded border border-gray-700 bg-gray-900/70 overflow-hidden flex items-center justify-center p-1">
                                        ${thumb
                                            ? `<img src="${escapeHTML(thumb)}" alt="${escapeHTML(game.name)}" class="max-w-full max-h-full object-contain" loading="lazy">`
                                            : '<span class="text-[10px] text-gray-500">No Image</span>'}
                                    </div>
                                    <a href="${statsUrl}" class="text-sm text-blue-300 hover:text-blue-200 underline font-semibold break-words">
                                        ${escapeHTML(game.name)}
                                    </a>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    let html = `
        <div class="mb-6 p-4 bg-gray-900/50 rounded border border-gray-700">
            <p class="text-gray-300 text-sm leading-relaxed">
                This page shows games from your collection that you have not played for over a year or never played.
                They are grouped by playtime so you can pick the right game based on available time.
            </p>
        </div>
        ${generateRandomPicksHTML(groups, randomPickIdsByGroupId)}
        ${groups.map((group, index) => `
        <div class="${index < groups.length - 1 ? 'mb-8' : ''}">
            <h3 class="text-xl ${group.titleClass} font-bold mb-3">${escapeHTML(group.title)} <span class="text-sm font-medium text-gray-400">(${escapeHTML(getGameCountLabel(group.games.length))})</span></h3>
            <div class="bg-gray-900 rounded-lg border border-gray-700">
                ${generateNextplayCardsHTML(group.games)}
            </div>
        </div>`).join('')}
    `;

    document.getElementById(targetId).innerHTML = html;
};
