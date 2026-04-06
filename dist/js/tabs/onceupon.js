window.renderOnceUponTab = function renderOnceUponTab({ onceUponData, allPlayers, escapeHTML, isValidImageUrl, getPlaceholderImageUrl, targetId = 'onceupon-content' }) {
    const cards = onceUponData && Array.isArray(onceUponData.cards) ? onceUponData.cards : [];

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

    function renderPlayCards(plays) {
        if (plays.length === 0) {
            return '<div class="p-4 text-gray-500 italic">🗂️ No plays recorded on this date.</div>';
        }

        let cardsHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">';

        plays.forEach(play => {
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
                    <div class="w-full h-32 bg-gray-700 flex items-center justify-center">
                        <img src="${safeThumbnailUrl}" alt="${escapeHTML(play.Game)}" class="max-w-full max-h-full object-contain" data-fallback-src="${safePlaceholderUrl}">
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
        return cardsHTML;
    }

    function renderCustomDatePicker() {
        return `
            <div class="px-4 py-4">
                <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">📅</span>
                    <input type="text" id="onceupon-custom-date-input" placeholder="Pick a date…" readonly
                        class="w-full pl-9 pr-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 cursor-pointer focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400/40 transition-colors">
                </div>
                <p class="text-xs text-gray-600 mt-2">Only dates with recorded plays are selectable.</p>
            </div>
            <div id="onceupon-custom-date-results">
                <div class="px-4 pb-4 text-gray-500 italic text-sm">Pick a date above to see games played.</div>
            </div>
        `;
    }

    const html = `
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            ${cards.map(card => {
                if (card.isCustom) {
                    return `
                        <section class="rounded-lg border border-gray-700 bg-gray-900/40 overflow-hidden">
                            <div class="px-4 py-3 border-b border-gray-700 bg-gray-900/70">
                                <h3 class="font-semibold ${card.titleClass}">${escapeHTML(card.title)}</h3>
                                <p class="text-xs text-gray-500 mt-1">${escapeHTML(card.dateLabel)}</p>
                            </div>
                            ${renderCustomDatePicker()}
                        </section>
                    `;
                }
                return `
                    <section class="rounded-lg border border-gray-700 bg-gray-900/40 overflow-hidden">
                        <div class="px-4 py-3 border-b border-gray-700 bg-gray-900/70">
                            <h3 class="font-semibold ${card.titleClass}">${escapeHTML(card.title)}</h3>
                            <p class="text-xs text-gray-500 mt-1">${escapeHTML(card.dateLabel)}</p>
                        </div>
                        ${renderPlayCards(card.plays)}
                    </section>
                `;
            }).join('')}
        </div>
    `;

    document.getElementById(targetId).innerHTML = html;

    const customDateInput = document.getElementById('onceupon-custom-date-input');
    const customDateResults = document.getElementById('onceupon-custom-date-results');

    if (customDateInput && typeof window.flatpickr === 'function') {
        const availableDates = onceUponData && Array.isArray(onceUponData.allPlays)
            ? [...new Set(onceUponData.allPlays.map(p => String(p.Date || '')).filter(Boolean))]
            : [];
        const availableDateSet = new Set(availableDates);

        window.flatpickr(customDateInput, {
            dateFormat: 'Y-m-d',
            enable: availableDates,
            disableMobile: true,
            onDayCreate: function (dObj, dStr, fp, dayElem) {
                const d = dayElem.dateObj;
                if (!d) return;
                const isPrevNext = dayElem.classList.contains('prevMonthDay') || dayElem.classList.contains('nextMonthDay');
                if (isPrevNext) return;
                const key = d.getFullYear() + '-'
                    + String(d.getMonth() + 1).padStart(2, '0') + '-'
                    + String(d.getDate()).padStart(2, '0');
                if (availableDateSet.has(key)) {
                    dayElem.classList.add('fp-has-plays');
                } else {
                    dayElem.classList.add('fp-no-plays');
                }
            },
            onChange: function (selectedDates, selectedDate) {
                if (!selectedDate) return;

                const selectedPlays = [];
                if (onceUponData && Array.isArray(onceUponData.allPlays)) {
                    onceUponData.allPlays.forEach(play => {
                        if (String(play.Date || '') === selectedDate) {
                            selectedPlays.push(play);
                        }
                    });
                }

                selectedPlays.sort((first, second) => (Number(second.timestamp) || 0) - (Number(first.timestamp) || 0));
                customDateResults.innerHTML = renderPlayCards(selectedPlays);
            }
        });
    }
};
