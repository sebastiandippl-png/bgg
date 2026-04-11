window.renderNextplayTab = function renderNextplayTab({ groups, escapeHTML, targetId = 'nextplay-content' }) {

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
            <div class="bg-gray-900 rounded-lg border border-gray-700">
                ${generateNextplayCardsHTML(group.games)}
            </div>
        </div>`).join('')}
    `;

    document.getElementById(targetId).innerHTML = html;
};
