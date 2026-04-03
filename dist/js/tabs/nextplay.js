window.renderNextplayTab = function renderNextplayTab({ groups, sortConfig, escapeHTML, targetId = 'nextplay-content' }) {
    const getSortIcon = (key) => {
        if (sortConfig.col !== key) return '↕';
        return sortConfig.asc ? '▲' : '▼';
    };

    const getSortClass = (key) => (sortConfig.col === key ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300');

    function generateNextplayCardsHTML(dataArray) {
        if (dataArray.length === 0) {
            return `<div class="p-4 text-gray-500 italic">No games found in this category.</div>`;
        }

        let html = '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3 p-3">';

        dataArray.forEach(row => {
            const bggUrl = `https://boardgamegeek.com/boardgame/${row.bggId}/`;
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
                        <a href="${bggUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 transition underline font-semibold text-sm break-words">
                            ${escapeHTML(row.name)}
                        </a>
                        <div class="mt-2 text-xs text-gray-300 space-y-1">
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Players</span>
                                <span>${escapeHTML(playerCountDisplay)}</span>
                            </div>
                            <div class="flex justify-between gap-3">
                                <span class="text-gray-500">Last played</span>
                                <span>${escapeHTML(lastPlayedDisplay)}</span>
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

    let html = `
        <div class="mb-6 p-4 bg-gray-900/50 rounded border border-gray-700">
            <p class="text-gray-300 text-sm leading-relaxed">
                This page shows games from your collection that you have not played for over a year or never played.
                They are grouped by playtime so you can pick the right game based on available time.
            </p>
        </div>
        ${groups.map((group, index) => `
        <div class="${index < groups.length - 1 ? 'mb-8' : ''}">
            <h3 class="text-xl ${group.titleClass} font-bold mb-3">${escapeHTML(group.title)}</h3>
            <div class="mb-3 flex flex-wrap gap-2 text-xs">
                <button class="px-2.5 py-1.5 rounded border border-gray-600 ${getSortClass('name')}" data-sort-tab="nextplay" data-sort-col="name">
                    Name ${getSortIcon('name')}
                </button>
                <button class="px-2.5 py-1.5 rounded border border-gray-600 ${getSortClass('maxPlayers')}" data-sort-tab="nextplay" data-sort-col="maxPlayers">
                    Players ${getSortIcon('maxPlayers')}
                </button>
                <button class="px-2.5 py-1.5 rounded border border-gray-600 ${getSortClass('lastPlayed')}" data-sort-tab="nextplay" data-sort-col="lastPlayed">
                    Last Played ${getSortIcon('lastPlayed')}
                </button>
            </div>
            <div class="bg-gray-900 rounded-lg border border-gray-700">
                ${generateNextplayCardsHTML(group.games)}
            </div>
        </div>`).join('')}
    `;

    document.getElementById(targetId).innerHTML = html;
};
