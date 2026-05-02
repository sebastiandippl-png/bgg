const bggDynamicThumbCache = new Map();
const bggDynamicThumbPending = new Map();

function normalizeBggId(value) {
    const normalized = String(value || '').trim().replace(/^bgg_/i, '');
    return /^\d+$/.test(normalized) ? normalized : '';
}

function normalizeImageUrlForDisplay(url) {
    const normalized = String(url || '').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('http://')) {
        return 'https://' + normalized.slice(7);
    }

    return normalized;
}

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

window.renderPlaysTab = function renderPlaysTab({ playsData, allPlaysData, chartData, allPlayers, escapeHTML, isValidImageUrl, getPlaceholderImageUrl, targetId = 'plays-table' }) {
    const recentPlays = playsData;
    const allPlays = Array.isArray(allPlaysData) && allPlaysData.length > 0 ? allPlaysData : recentPlays;
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

    function renderRatingValue(value) {
        if (value === null || value === undefined || value === '') {
            return '-';
        }
        return escapeHTML(String(value));
    }

    function renderOnceUponDateLink(dateValue) {
        const normalizedDate = String(dateValue || '').trim();
        const safeDate = escapeHTML(normalizedDate || '-');
        if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(normalizedDate)) {
            return safeDate;
        }

        const href = '#onceupon/' + encodeURIComponent(normalizedDate);
        return '<a href="' + href + '" class="text-cyan-300 hover:text-cyan-200 underline">' + safeDate + '</a>';
    }

    function extractPlayBggId(play) {
        const fromGame = normalizeBggId(play && play.game && play.game.bggId);
        if (fromGame) {
            return fromGame;
        }

        return normalizeBggId(play && play.gameId);
    }

    function getPlayThumbnailData(play) {
        const placeholderSvg = typeof getPlaceholderImageUrl === 'function' ? getPlaceholderImageUrl() : '';
        const game = play && play.game;
        if (game && game.urlThumb && isValidImageUrl(game.urlThumb)) {
            return {
                url: game.urlThumb,
                placeholder: placeholderSvg,
                dynamicBggId: null
            };
        }

        const bggId = extractPlayBggId(play);
        return {
            url: placeholderSvg,
            placeholder: placeholderSvg,
            dynamicBggId: play && play.isNotOwned && bggId ? bggId : null
        };
    }

    async function fetchDynamicBggThumbUrl(bggId) {
        if (!bggId) {
            return null;
        }

        if (bggDynamicThumbCache.has(bggId)) {
            return bggDynamicThumbCache.get(bggId);
        }

        if (bggDynamicThumbPending.has(bggId)) {
            return bggDynamicThumbPending.get(bggId);
        }

        const request = fetch('api/get_game_image.php?id=' + encodeURIComponent(bggId), {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(response => response.ok ? response.json() : null)
            .then(payload => {
                const thumbUrl = payload && payload.success && typeof payload.urlThumb === 'string'
                    ? payload.urlThumb.trim()
                    : '';
                const normalizedThumb = normalizeImageUrlForDisplay(thumbUrl);
                const resolved = normalizedThumb && isValidImageUrl(normalizedThumb) ? normalizedThumb : null;
                bggDynamicThumbCache.set(bggId, resolved);
                return resolved;
            })
            .catch(() => {
                bggDynamicThumbCache.set(bggId, null);
                return null;
            })
            .finally(() => {
                bggDynamicThumbPending.delete(bggId);
            });

        bggDynamicThumbPending.set(bggId, request);
        return request;
    }

    function hydrateDynamicBggThumbnails(container) {
        if (!(container instanceof HTMLElement)) {
            return;
        }

        const images = container.querySelectorAll('img[data-bgg-thumb-id]');
        images.forEach(image => {
            if (!(image instanceof HTMLImageElement)) {
                return;
            }

            const bggId = normalizeBggId(image.dataset.bggThumbId);
            if (!bggId) {
                return;
            }

            fetchDynamicBggThumbUrl(bggId).then(url => {
                if (!url || !image.isConnected) {
                    return;
                }

                image.src = url;
            });
        });
    }

    function renderMonthCollageCard(monthOffset, borderColor, gradientColors) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
        monthStart.setHours(0, 0, 0, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const monthPlays = allPlays.filter(play => {
            const playDate = play && play.Date ? new Date(play.Date) : null;
            if (!playDate || Number.isNaN(playDate.getTime())) {
                return false;
            }
            return playDate >= monthStart && playDate <= monthEnd;
        });

        if (monthPlays.length === 0) {
            return '';
        }

        const monthTitle = new Intl.DateTimeFormat(undefined, {
            month: 'long',
            year: 'numeric'
        }).format(monthStart);

        const gamesByKey = new Map();

        monthPlays.forEach(play => {
            const fallbackName = String((play && play.Game) || 'Unknown Game').trim() || 'Unknown Game';
            const gameKey = play && play.gameId
                ? `id:${String(play.gameId).trim()}`
                : `name:${fallbackName.toLowerCase()}`;
            const duration = Number(play && play.Duration);
            const thumbnailData = getPlayThumbnailData(play);

            if (!gamesByKey.has(gameKey)) {
                gamesByKey.set(gameKey, {
                    key: gameKey,
                    gameName: fallbackName,
                    playCount: 0,
                    totalDuration: 0,
                    thumbnailUrl: thumbnailData.url,
                    dynamicBggId: thumbnailData.dynamicBggId
                });
            }

            const item = gamesByKey.get(gameKey);
            item.playCount += 1;
            item.totalDuration += Number.isFinite(duration) ? duration : 0;
        });

        const gameList = [...gamesByKey.values()]
            .sort((a, b) => b.totalDuration - a.totalDuration || b.playCount - a.playCount || a.gameName.localeCompare(b.gameName));

        const mostPlayedKey = gameList.reduce((bestKey, item) => {
            if (!bestKey) {
                return item.key;
            }
            const currentBest = gamesByKey.get(bestKey);
            if (!currentBest) {
                return item.key;
            }
            if (item.playCount > currentBest.playCount) {
                return item.key;
            }
            if (item.playCount === currentBest.playCount && item.totalDuration > currentBest.totalDuration) {
                return item.key;
            }
            return bestKey;
        }, null);
        const mostTimeKey = gameList.reduce((bestKey, item) => {
            if (!bestKey) {
                return item.key;
            }
            const currentBest = gamesByKey.get(bestKey);
            if (!currentBest) {
                return item.key;
            }
            if (item.totalDuration > currentBest.totalDuration) {
                return item.key;
            }
            if (item.totalDuration === currentBest.totalDuration && item.playCount > currentBest.playCount) {
                return item.key;
            }
            return bestKey;
        }, null);

        const collageItemsMarkup = gameList.map(item => {
            const safeThumb = escapeHTML(item.thumbnailUrl || '');
            const safeName = escapeHTML(item.gameName || 'Unknown Game');
            const dynamicThumbAttr = item.dynamicBggId ? ` data-bgg-thumb-id="${escapeHTML(item.dynamicBggId)}"` : '';
            const trophyBadge = item.key === mostPlayedKey
                ? '<span class="absolute top-1 left-1 rounded-full bg-amber-400/95 text-gray-900 text-[11px] leading-none px-1 py-0.5" title="Most played game">🏆</span>'
                : '';
            const watchBadge = item.key === mostTimeKey
                ? '<span class="absolute top-1 right-1 rounded-full bg-cyan-300/95 text-gray-900 text-[11px] leading-none px-1 py-0.5" title="Most time spent">⌚</span>'
                : '';

            return `
                <div class="relative overflow-hidden rounded-md border border-gray-600/70 bg-gray-700/70">
                    <img src="${safeThumb}" alt="${safeName}" class="w-full h-full object-cover aspect-square" loading="lazy"${dynamicThumbAttr}>
                    ${trophyBadge}
                    ${watchBadge}
                </div>
            `;
        }).join('');

        return `
            <div class="bg-gray-800 border ${borderColor} rounded-lg overflow-hidden hover:shadow-lg hover:shadow-indigo-500/20 transition-all duration-200 h-full lg:col-span-2">
                <div class="relative p-3 sm:p-4 bg-gradient-to-br ${gradientColors}">
                    <div class="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.4),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.35),_transparent_40%)]"></div>
                    <div class="relative flex items-center justify-between mb-3">
                        <h3 class="text-sm sm:text-base font-semibold text-gray-100 tracking-wide">${escapeHTML(monthTitle)}</h3>
                        <span class="text-[11px] sm:text-xs text-gray-300 bg-black/35 px-2 py-1 rounded-md">${monthPlays.length} plays • ${gameList.length} games</span>
                    </div>
                    <div class="relative grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-1.5">
                        ${collageItemsMarkup}
                    </div>
                    <div class="relative mt-3 text-[11px] sm:text-xs text-gray-300 flex gap-3 flex-wrap">
                        <span><span class="text-amber-300">🏆</span> Most played: ${escapeHTML(gameList[0] ? gameList[0].gameName : 'N/A')}</span>
                        <span><span class="text-cyan-300">⌚</span> Most time: ${escapeHTML(gamesByKey.get(mostTimeKey) ? gamesByKey.get(mostTimeKey).gameName : 'N/A')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    cardsHTML += renderMonthCollageCard(0, 'border-emerald-600/40', 'from-slate-900 via-green-900/40 to-slate-900');
    cardsHTML += renderMonthCollageCard(-1, 'border-indigo-600/40', 'from-slate-900 via-gray-800 to-slate-900');

    recentPlays.forEach(play => {
        const game = play.game;
        const thumbnailData = getPlayThumbnailData(play);
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

        const safeThumbnailUrl = escapeHTML(thumbnailData.url || '');
        const safePlaceholderUrl = escapeHTML(thumbnailData.placeholder || '');
        const dynamicThumbAttr = thumbnailData.dynamicBggId
            ? ` data-bgg-thumb-id="${escapeHTML(thumbnailData.dynamicBggId)}"`
            : '';

        const gameLink = getGameLinkParts(play);
        const ratingsMarkup = game
            ? renderRatingValue(game.averageRating) + ' / ' + renderRatingValue(game.geekRating)
            : '-';

        cardsHTML += `
            <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 h-full">
                <div class="w-full h-32 bg-gray-700 flex items-center justify-center relative">
                    <img src="${safeThumbnailUrl}" alt="${escapeHTML(play.Game)}" class="max-w-full max-h-full object-contain" data-fallback-src="${safePlaceholderUrl}"${dynamicThumbAttr}>
                    ${play.isNotOwned ? '<div class="absolute top-2 left-2 bg-red-600/90 text-white text-xs px-2 py-1 rounded font-semibold">Not Owned</div>' : ''}
                </div>
                <div class="p-4">
                    <h3 class="font-semibold text-lg mb-3 truncate text-gray-100"><a href="${gameLink.href}"${gameLink.attrs} class="text-blue-400 hover:text-blue-300 underline">${escapeHTML(play.Game)}</a>${gameLink.isExternal ? '<span class="ml-2 text-[11px] font-semibold text-cyan-300">BGG ↗</span>' : ''}</h3>
                    <div class="text-sm text-gray-400 space-y-2">
                        <p><span class="text-gray-500">📅 Date:</span> ${renderOnceUponDateLink(play.Date)}</p>
                        <p><span class="text-gray-500">⏱️ Duration:</span> ${escapeHTML(play.Duration)} min</p>
                        <p><span class="text-gray-500">⭐ Avg / Geek:</span> ${ratingsMarkup}</p>
                        <p><span class="text-gray-500">👥 Players:</span> ${coPlayersMarkup}</p>
                        <p><span class="text-gray-500">🏆 Winner:</span> ${winnersMarkup}</p>
                    </div>
                </div>
            </div>
        `;
    });

    cardsHTML += '</div>';
    const target = document.getElementById(targetId);
    if (!target) {
        return;
    }

    target.innerHTML = renderPlays4WeekChart(chartData) + cardsHTML;
    hydrateDynamicBggThumbnails(target);
};
