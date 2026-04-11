window.BGStatsGameStats = (function createGameStatsModule() {
    var _selectedGameId = null;
    var _allGames = [];
    var _currentMatches = [];

    function selectMatch(index) {
        var game = _currentMatches[index];
        if (!game) { return; }
        _selectedGameId = game.id;
        if (window.BGStatsDashboard && typeof window.BGStatsDashboard.switchTab === 'function') {
            window.BGStatsDashboard.switchTab('gamestats');
        }
    }

    function clearGame() {
        _selectedGameId = null;
        if (window.BGStatsDashboard && typeof window.BGStatsDashboard.switchTab === 'function') {
            window.BGStatsDashboard.switchTab('gamestats');
        }
    }

    function handleSearchInput(event) {
        var query = String(event.target.value || '').trim().toLowerCase();
        var dropdown = document.getElementById('gamestats-dropdown');
        if (!dropdown) { return; }

        if (!query) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            _currentMatches = [];
            return;
        }

        var matches = _allGames
            .filter(function (g) {
                return String(g.name || '').toLowerCase().indexOf(query) !== -1;
            })
            .sort(function (a, b) {
                var aName = String(a.name || '').toLowerCase();
                var bName = String(b.name || '').toLowerCase();
                var aStart = aName.indexOf(query) === 0;
                var bStart = bName.indexOf(query) === 0;
                if (aStart && !bStart) { return -1; }
                if (!aStart && bStart) { return 1; }
                return aName.localeCompare(bName);
            })
            .slice(0, 14);

        _currentMatches = matches;

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500 italic">🗂️ No games found</div>';
        } else {
            dropdown.innerHTML = matches.map(function (g, i) {
                var safeName = String(g.name || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
                return '<button'
                    + ' class="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 border-b border-gray-700/40 last:border-0"'
                    + ' onclick="window.BGStatsGameStats.selectMatch(' + i + ')"'
                    + '>'
                    + (g.year ? '<span class="text-xs text-gray-500 shrink-0 w-10">' + g.year + '</span>' : '<span class="w-10 shrink-0"></span>')
                    + '<span class="flex-1 truncate">' + safeName + '</span>'
                    + (g.isExpansion ? '<span class="text-xs text-gray-600 shrink-0 italic">exp</span>' : '')
                    + '</button>';
            }).join('');
        }

        dropdown.classList.remove('hidden');
    }

    return {
        get selectedGameId() { return _selectedGameId; },
        setAllGames: function (games) { _allGames = Array.isArray(games) ? games : []; },
        setSelectedGameId: function (id) { _selectedGameId = (id !== null && id !== undefined) ? id : null; },
        selectMatch: selectMatch,
        clearGame: clearGame,
        handleSearchInput: handleSearchInput
    };
})();

window.renderGameStatsTab = function renderGameStatsTab(options) {
    var allGames = options.allGames;
    var allPlayers = options.allPlayers;
    var gameStatsData = options.gameStatsData;
    var escapeHTML = options.escapeHTML;
    var isValidImageUrl = options.isValidImageUrl;
    var getPlaceholderImageUrl = options.getPlaceholderImageUrl;
    var targetId = options.targetId || 'gamestats-content';

    var container = document.getElementById(targetId);
    if (!container) { return; }

    window.BGStatsGameStats.setAllGames(allGames);

    function getPlayerKeyByName(name) {
        var normalizedName = String(name || '').trim().toLowerCase();
        if (!normalizedName || !Array.isArray(allPlayers)) {
            return null;
        }

        var match = allPlayers.find(function (player) {
            return String(player.name || '').trim().toLowerCase() === normalizedName;
        });

        return match && match.key ? String(match.key) : null;
    }

    function renderLinkedPlayerName(name, extraClass) {
        var safeName = escapeHTML(String(name || ''));
        var playerKey = getPlayerKeyByName(name);
        var className = extraClass ? ' class="' + extraClass + '"' : '';

        if (!playerKey) {
            return '<span' + className + '>' + safeName + '</span>';
        }

        return '<a href="#playerstats/' + encodeURIComponent(playerKey) + '"' + className + '>' + safeName + '</a>';
    }

    function renderLinkedPlayerList(names, extraClass) {
        if (!Array.isArray(names) || names.length === 0) {
            return '';
        }

        return names.map(function (name) {
            return renderLinkedPlayerName(name, extraClass);
        }).join('<span class="text-gray-700">, </span>');
    }

    function renderSearchView() {
        return '<div class="max-w-xl mx-auto pt-8 pb-4 px-2 sm:px-4">'
            + '<h2 class="text-lg font-semibold text-gray-200 mb-4">🔎 Search for a game</h2>'
            + '<div class="relative">'
            + '<input'
            + ' id="gamestats-search-input"'
            + ' type="text"'
            + ' placeholder="Start typing a game name\u2026"'
            + ' autocomplete="off"'
            + ' spellcheck="false"'
            + ' class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"'
            + ' oninput="window.BGStatsGameStats.handleSearchInput(event)"'
            + ' onblur="window.setTimeout(function(){var d=document.getElementById(\'gamestats-dropdown\');if(d)d.classList.add(\'hidden\');},160)"'
            + ' onfocus="if(this.value.trim())window.BGStatsGameStats.handleSearchInput({target:this})"'
            + '>'
            + '<div id="gamestats-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-10 max-h-80 overflow-y-auto"></div>'
            + '</div>'
            + '<p class="text-xs text-gray-600 mt-3">Type a game name to see detailed statistics.</p>'
            + '</div>';
    }

    function fmt(val) {
        if (val === null || val === undefined || val === '') {
            return '<span class="text-gray-600">\u2014</span>';
        }
        return escapeHTML(String(val));
    }

    function fmtNum(val, decimals) {
        decimals = decimals !== undefined ? decimals : 1;
        if (val === null || val === undefined || !Number.isFinite(Number(val))) {
            return '<span class="text-gray-600">\u2014</span>';
        }
        return escapeHTML(Number(val).toFixed(decimals));
    }

    function fmtDurationMin(val, decimals) {
        if (val === null || val === undefined || !Number.isFinite(Number(val))) {
            return '<span class="text-gray-600">\u2014</span>';
        }
        return escapeHTML(Number(val).toFixed(decimals)) + ' min';
    }

    function renderOnceUponDateLink(dateValue, fallbackText, className) {
        var normalizedDate = String(dateValue || '').trim();
        var safeLabel = escapeHTML(normalizedDate || (fallbackText || '\u2014'));
        if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(normalizedDate)) {
            return '<span class="' + (className || 'text-gray-200') + '">' + safeLabel + '</span>';
        }

        return '<a href="#onceupon/' + encodeURIComponent(normalizedDate) + '" class="' + (className || 'text-cyan-300 hover:text-cyan-200 underline') + '">' + safeLabel + '</a>';
    }

    function renderPlaysTimelineChart(plays) {
        var rows = Array.isArray(plays) ? plays : [];
        if (rows.length === 0) {
            return '<div class="mt-4 pt-3 border-t border-gray-700/50">'
                + '<div class="text-xs text-gray-500 mb-2">Plays Over Time</div>'
                + '<div class="text-xs text-gray-600 italic">No play data for timeline.</div>'
                + '</div>';
        }

        function toMonthKey(dateValue) {
            var parts = String(dateValue || '').split('-');
            if (parts.length < 2) {
                return null;
            }
            var year = Number(parts[0]);
            var month = Number(parts[1]);
            if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
                return null;
            }
            return String(year) + '-' + String(month).padStart(2, '0');
        }

        var monthlyCounts = {};
        rows.forEach(function (play) {
            var key = toMonthKey(play && play.Date);
            if (!key) {
                return;
            }
            if (!monthlyCounts[key]) {
                monthlyCounts[key] = 0;
            }
            monthlyCounts[key] += 1;
        });

        var availableMonths = Object.keys(monthlyCounts).sort();
        if (availableMonths.length === 0) {
            return '<div class="mt-4 pt-3 border-t border-gray-700/50">'
                + '<div class="text-xs text-gray-500 mb-2">Plays Over Time</div>'
                + '<div class="text-xs text-gray-600 italic">No play data for timeline.</div>'
                + '</div>';
        }

        var firstParts = availableMonths[0].split('-');
        var lastParts = availableMonths[availableMonths.length - 1].split('-');
        var firstYear = Number(firstParts[0]);
        var firstMonth = Number(firstParts[1]);
        var lastYear = Number(lastParts[0]);
        var lastMonth = Number(lastParts[1]);

        var monthSeries = [];
        var cursorYear = firstYear;
        var cursorMonth = firstMonth;
        while (cursorYear < lastYear || (cursorYear === lastYear && cursorMonth <= lastMonth)) {
            var monthKey = String(cursorYear) + '-' + String(cursorMonth).padStart(2, '0');
            monthSeries.push({
                key: monthKey,
                count: monthlyCounts[monthKey] || 0
            });
            cursorMonth += 1;
            if (cursorMonth > 12) {
                cursorMonth = 1;
                cursorYear += 1;
            }
        }

        var maxCount = monthSeries.reduce(function (maxVal, entry) {
            return Math.max(maxVal, entry.count);
        }, 0);
        var maxCountEntry = monthSeries.find(function (entry) {
            return entry.count === maxCount;
        }) || { key: 'N/A' };

        var width = 300;
        var height = 92;
        var chartLeft = 8;
        var chartRight = 8;
        var chartTop = 8;
        var chartBottom = 22;
        var chartWidth = width - chartLeft - chartRight;
        var chartHeight = height - chartTop - chartBottom;
        var barGap = 1;
        var barWidth = Math.max(1, Math.floor((chartWidth - Math.max(0, monthSeries.length - 1) * barGap) / monthSeries.length));
        var barsTotalWidth = barWidth * monthSeries.length + Math.max(0, monthSeries.length - 1) * barGap;
        var startX = chartLeft + Math.max(0, Math.floor((chartWidth - barsTotalWidth) / 2));

        var bars = monthSeries.map(function (entry, index) {
            var ratio = maxCount > 0 ? (entry.count / maxCount) : 0;
            var barHeight = Math.max(1, Math.round(ratio * chartHeight));
            var x = startX + index * (barWidth + barGap);
            var y = chartTop + (chartHeight - barHeight);
            var safeTitle = escapeHTML(entry.key + ': ' + String(entry.count) + ' plays');
            return '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="1" fill="#8b5cf6">'
                + '<title>' + safeTitle + '</title>'
                + '</rect>';
        }).join('');

        var firstLabel = escapeHTML(monthSeries[0].key);
        var lastLabel = escapeHTML(monthSeries[monthSeries.length - 1].key);

        return '<div class="mt-4 pt-3 border-t border-gray-700/50">'
            + '<div class="text-xs text-gray-500 mb-2">Plays Over Time</div>'
            + '<svg viewBox="0 0 ' + width + ' ' + height + '" class="w-full h-24" role="img" aria-label="Plays over time chart">'
            + '<line x1="' + chartLeft + '" y1="' + (chartTop + chartHeight) + '" x2="' + (width - chartRight) + '" y2="' + (chartTop + chartHeight) + '" stroke="#374151" stroke-width="1" />'
            + bars
            + '</svg>'
            + '<div class="flex items-center justify-between text-[10px] text-gray-500 mt-1">'
            + '<span>' + firstLabel + '</span>'
            + '<span>max ' + escapeHTML(String(maxCount)) + '/month (' + escapeHTML(maxCountEntry.key) + ')</span>'
            + '<span>' + lastLabel + '</span>'
            + '</div>'
            + '</div>';
    }

    function renderDetailView(data) {
        var game = data.game;
        var playCount = data.playCount;
        var lastPlayed = data.lastPlayed;
        var firstPlayed = data.firstPlayed;
        var shortestPlaytimeMin = data.shortestPlaytimeMin;
        var longestPlaytimeMin = data.longestPlaytimeMin;
        var averagePlaytimeMin = data.averagePlaytimeMin;
        var avgScore = data.avgScore;
        var highScore = data.highScore;
        var highScorePlayers = Array.isArray(data.highScorePlayers) ? data.highScorePlayers : [];
        var lowScore = data.lowScore;
        var lowScorePlayers = Array.isArray(data.lowScorePlayers) ? data.lowScorePlayers : [];
        var avgWinningScore = data.avgWinningScore;
        var players = data.players;
        var recentPlays = data.recentPlays;

        var highestWithNames = fmtNum(highScore, 0);
        if (highScorePlayers.length > 0) {
            highestWithNames += '<span class="block text-xs text-gray-500 mt-0.5">' + renderLinkedPlayerList(highScorePlayers, 'text-gray-500 hover:text-gray-300 underline') + '</span>';
        }

        var lowestWithNames = fmtNum(lowScore, 0);
        if (lowScorePlayers.length > 0) {
            lowestWithNames += '<span class="block text-xs text-gray-500 mt-0.5">' + renderLinkedPlayerList(lowScorePlayers, 'text-gray-500 hover:text-gray-300 underline') + '</span>';
        }

        var placeholderSvg = typeof getPlaceholderImageUrl === 'function' ? getPlaceholderImageUrl() : '';
        var thumbnailUrl = placeholderSvg;
        if (game.urlThumb && isValidImageUrl(game.urlThumb)) {
            thumbnailUrl = game.urlThumb;
        }
        var safeThumbnailUrl = escapeHTML(thumbnailUrl);
        var safePlaceholderUrl = escapeHTML(placeholderSvg);
        var bggUrl = game.bggId ? 'https://boardgamegeek.com/boardgame/' + escapeHTML(String(game.bggId)) + '/' : null;

        // -- Header --
        var tags = '';
        var collectionStatusBadges = [
            { active: game.owned, label: 'owned', className: 'bg-emerald-900/50 text-emerald-400' },
            { active: game.prevOwned, label: 'prevOwned', className: 'bg-rose-900/50 text-rose-300' },
            { active: game.forTrade, label: 'forTrade', className: 'bg-sky-900/50 text-sky-300' },
            { active: game.want, label: 'want', className: 'bg-violet-900/50 text-violet-300' },
            { active: game.wantToPlay, label: 'wantToPlay', className: 'bg-cyan-900/50 text-cyan-300' },
            { active: game.wantToBuy, label: 'wantToBuy', className: 'bg-amber-900/50 text-amber-300' },
            { active: game.wishlist, label: 'wishlist', className: 'bg-fuchsia-900/50 text-fuchsia-300' },
            { active: game.preordered, label: 'preordered', className: 'bg-indigo-900/50 text-indigo-300' }
        ];
        if (game.year) { tags += '<span class="text-xs text-gray-500">' + escapeHTML(String(game.year)) + '</span>'; }
        if (game.isExpansion) { tags += '<span class="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded ml-2">Expansion</span>'; }
        collectionStatusBadges.forEach(function (badge) {
            if (!badge.active) {
                return;
            }

            tags += '<span class="text-xs px-2 py-0.5 rounded ml-2 ' + badge.className + '">' + escapeHTML(badge.label) + '</span>';
        });

        var header = '<div class="flex items-start gap-4 mb-6">'
            + '<div class="shrink-0 w-20 h-20 bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">'
            + '<img src="' + safeThumbnailUrl + '" alt="' + escapeHTML(game.name) + '" class="max-w-full max-h-full object-contain" data-fallback-src="' + safePlaceholderUrl + '">'
            + '</div>'
            + '<div class="min-w-0 flex-1 pt-1">'
            + '<h2 class="text-xl font-bold text-gray-100 leading-tight">' + escapeHTML(game.name) + '</h2>'
            + '<div class="flex flex-wrap items-center gap-1 mt-1.5">' + tags + '</div>'
            + '</div>'
            + (bggUrl ? '<a href="' + bggUrl + '" target="_blank" rel="noopener noreferrer" class="shrink-0 text-xs text-blue-400 hover:text-blue-300 mt-1">BGG\u00a0\u2197</a>' : '')
            + '</div>';

        // -- Game Info block --
        var gameInfoRows = '';
        var playerRange = (game.minPlayers || '?') + (game.maxPlayers && game.maxPlayers !== game.minPlayers ? '\u2013' + game.maxPlayers : '');
        gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Players</dt><dd class="text-gray-200 text-right">' + escapeHTML(String(playerRange)) + '</dd></div>';
        if (game.bestWith) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Best With</dt><dd class="text-gray-200 text-right">' + fmt(game.bestWith) + '</dd></div>'; }
        if (game.recommendedWith) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Recommended</dt><dd class="text-gray-200 text-right">' + fmt(game.recommendedWith) + '</dd></div>'; }
        var playTimeRange = (game.minPlayTime || '?') + (game.maxPlayTime && game.maxPlayTime !== game.minPlayTime ? '\u2013' + game.maxPlayTime : '') + ' min';
        gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Play Time</dt><dd class="text-gray-200 text-right">' + escapeHTML(playTimeRange) + '</dd></div>';
        if (game.weight) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Weight</dt><dd class="text-gray-200 text-right">' + fmt(game.weight) + '</dd></div>'; }
        if (game.designer) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Designer</dt><dd class="text-gray-200 text-right text-sm">' + fmt(game.designer) + '</dd></div>'; }
        if (game.rating) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Your Rating</dt><dd class="text-amber-300 text-right font-medium">' + fmt(game.rating) + '</dd></div>'; }
        if (game.averageRating) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Average Rating</dt><dd class="text-gray-200 text-right">' + fmt(game.averageRating) + '</dd></div>'; }
        if (game.geekRating) { gameInfoRows += '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Geek Rating</dt><dd class="text-gray-200 text-right">' + fmt(game.geekRating) + '</dd></div>'; }

        var priceRowId = 'gamestats-price-row-' + escapeHTML(String(game.bggId || ''));
        gameInfoRows += '<div id="' + priceRowId + '" class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Best Price</dt><dd class="text-gray-400 text-right text-xs italic">loading…</dd></div>';

        var gameInfoBlock = '<div class="rounded-lg border border-gray-700 p-4">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">🎲 Game Info</h3>'
            + '<dl class="space-y-2 text-sm">' + gameInfoRows + '</dl>'
            + '</div>';

        // -- Play history block --
        var playHistoryBlock = '<div class="rounded-lg border border-gray-700 p-4">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">📊 Play Summary</h3>'
            + '<dl class="space-y-2 text-sm">'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Total Plays</dt><dd class="text-violet-400 font-bold text-right">' + escapeHTML(String(playCount)) + '</dd></div>'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Last Played</dt><dd class="text-right">' + renderOnceUponDateLink(lastPlayed, '\u2014', 'text-cyan-300 hover:text-cyan-200 underline') + '</dd></div>'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">First Played</dt><dd class="text-right">' + renderOnceUponDateLink(firstPlayed, '\u2014', 'text-cyan-300 hover:text-cyan-200 underline') + '</dd></div>'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Shortest Playtime</dt><dd class="text-gray-200 text-right">' + fmtDurationMin(shortestPlaytimeMin, 0) + '</dd></div>'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Longest Playtime</dt><dd class="text-gray-200 text-right">' + fmtDurationMin(longestPlaytimeMin, 0) + '</dd></div>'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Average Playtime</dt><dd class="text-gray-200 text-right">' + fmtDurationMin(averagePlaytimeMin, 1) + '</dd></div>'
            + '</dl>'
            + renderPlaysTimelineChart(recentPlays)
            + '</div>';

        // -- Scores block (only if there are scores) --
        var scoresBlock = '';
        if (avgScore !== null) {
            scoresBlock = '<div class="rounded-lg border border-gray-700 p-4">'
                + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">🧮 Scores</h3>'
                + '<dl class="grid grid-cols-2 gap-3 text-sm">'
                + '<div><dt class="text-xs text-gray-500">Average</dt><dd class="text-gray-200 font-medium mt-0.5">' + fmtNum(avgScore) + '</dd></div>'
                + '<div><dt class="text-xs text-gray-500">Highest</dt><dd class="text-green-400 font-medium mt-0.5">' + highestWithNames + '</dd></div>'
                + '<div><dt class="text-xs text-gray-500">Lowest</dt><dd class="text-rose-400 font-medium mt-0.5">' + lowestWithNames + '</dd></div>'
                + '<div><dt class="text-xs text-gray-500">Avg Winning</dt><dd class="text-amber-400 font-medium mt-0.5">' + fmtNum(avgWinningScore) + '</dd></div>'
                + '</dl>'
                + '</div>';
        }

        // -- Player leaderboard --
        var playersBlock = '';
        if (players.length > 0) {
            var playerRows = players.map(function (p, i) {
                var medal = '';
                if (i === 0 && p.wins > 0) { medal = ' \uD83C\uDFC6'; }
                var winText = p.wins > 0
                    ? '<span class="text-amber-400 font-medium">' + p.wins + ' win' + (p.wins !== 1 ? 's' : '') + medal + '</span>'
                    : '<span class="text-gray-700">0 wins</span>';
                return '<div class="flex items-center gap-3 text-sm">'
                    + '<span class="text-xs text-gray-600 w-5 text-right shrink-0">' + (i + 1) + '.</span>'
                    + '<span class="text-gray-200 flex-1 truncate">' + renderLinkedPlayerName(p.name, 'text-gray-200 hover:text-blue-300 underline') + '</span>'
                    + '<span class="text-xs text-gray-500 shrink-0">' + p.plays + ' play' + (p.plays !== 1 ? 's' : '') + '</span>'
                    + '<span class="text-xs shrink-0 w-20 text-right">' + winText + '</span>'
                    + '</div>';
            }).join('');

            playersBlock = '<div class="rounded-lg border border-gray-700 p-4">'
                + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">👥 Player Leaderboard</h3>'
                + '<div class="space-y-2.5">' + playerRows + '</div>'
                + '</div>';
        }

        // -- All plays --
        var recentPlaysBlock = '';
        if (recentPlays.length > 0) {
            var playRows = recentPlays.map(function (play) {
                var scores = Array.isArray(play.playerScores) ? play.playerScores : [];
                var hasScoreValues = scores.some(function (s) {
                    return s.score !== null && s.score !== undefined && s.score !== '';
                });

                var playerCells = scores.length > 0
                    ? scores.map(function (s) {
                        var isWin = s.winner === true || s.winner === 1 || s.winner === '1';
                        var scoreText = hasScoreValues && s.score !== null && s.score !== undefined && s.score !== ''
                            ? ' (' + escapeHTML(String(s.score)) + ')'
                            : '';
                        return '<span class="' + (isWin ? 'text-amber-400 font-medium' : 'text-gray-400') + '">'
                            + renderLinkedPlayerName(String(s.playerName || ''), isWin ? 'text-amber-400 font-medium hover:text-amber-300 underline' : 'text-gray-400 hover:text-gray-200 underline')
                            + scoreText + (isWin ? '\u00a0\uD83C\uDFC6' : '')
                            + '</span>';
                    }).join('<span class="text-gray-700">, </span>')
                    : '<span class="text-gray-700 italic">No player data</span>';

                return '<div class="flex items-start gap-3 py-2 border-b border-gray-700/40 last:border-0 text-sm">'
                    + '<span class="shrink-0 w-24 tabular-nums">' + renderOnceUponDateLink(play.Date, '\u2014', 'text-cyan-300 hover:text-cyan-200 underline') + '</span>'
                    + '<span class="text-gray-600 shrink-0 w-16 tabular-nums">' + (play.Duration ? escapeHTML(String(play.Duration)) + '\u00a0min' : '') + '</span>'
                    + '<span class="flex-1 flex flex-wrap gap-x-1.5 gap-y-0.5">' + playerCells + '</span>'
                    + '</div>';
            }).join('');

            recentPlaysBlock = '<div class="rounded-lg border border-gray-700 p-4 md:col-span-2">'
                + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">🕘 All Plays</h3>'
                + '<div>' + playRows + '</div>'
                + '</div>';
        }

        // -- Forum cards (News + General) --
        var forumsBlock = '<div class="rounded-lg border border-gray-700 p-4 md:col-span-2" id="gamestats-forums-block">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">\uD83D\uDDE8\uFE0F BGG Forums</h3>'
            + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="gamestats-forums-inner">'
            + '<div id="gamestats-forum-News" class="rounded-md bg-gray-900/40 p-3">'
            + '<div class="text-xs font-semibold text-gray-400 mb-2">\uD83D\uDCE2 News</div>'
            + '<div class="text-xs text-gray-600 italic">Loading\u2026</div>'
            + '</div>'
            + '<div id="gamestats-forum-General" class="rounded-md bg-gray-900/40 p-3">'
            + '<div class="text-xs font-semibold text-gray-400 mb-2">\uD83D\uDCAC General</div>'
            + '<div class="text-xs text-gray-600 italic">Loading\u2026</div>'
            + '</div>'
            + '</div>'
            + '</div>';

        // Arrange in responsive grid - 2 columns on md+
        // Order: gameInfo | playHistory / scores | players / recentPlays (full width)

        return '<div>'
            + '<div class="flex items-center gap-3 mb-5">'
            + '<button onclick="window.BGStatsGameStats.clearGame()" class="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 transition">'
            + '\u2190 Search'
            + '</button>'
            + '</div>'
            + header
            + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'
            + gameInfoBlock
            + playHistoryBlock
            + scoresBlock
            + playersBlock
            + recentPlaysBlock
            + forumsBlock
            + '</div>'
            + '</div>';
    }

    if (!gameStatsData) {
        container.innerHTML = renderSearchView();
        // Auto-focus the search input
        window.setTimeout(function () {
            var input = document.getElementById('gamestats-search-input');
            if (input) { input.focus(); }
        }, 50);
        return;
    }

    container.innerHTML = renderDetailView(gameStatsData);

    // Async: fetch BGG forum threads for News and General
    var bggIdForForums = gameStatsData && gameStatsData.game && gameStatsData.game.bggId
        ? String(gameStatsData.game.bggId)
        : null;
    if (bggIdForForums) {
        fetch('api/get_bgg_forums.php?bgg_id=' + encodeURIComponent(bggIdForForums))
            .then(function (res) { return res.json(); })
            .then(function (json) {
                var forumTitles = ['News', 'General'];
                var forumIcons = { News: '\uD83D\uDCE2', General: '\uD83D\uDCAC' };
                forumTitles.forEach(function (title) {
                    var el = document.getElementById('gamestats-forum-' + title);
                    if (!el) { return; }
                    var threads = (json.success && json.forums && Array.isArray(json.forums[title]))
                        ? json.forums[title]
                        : [];
                    if (threads.length === 0) {
                        el.innerHTML = '<div class="text-xs font-semibold text-gray-400 mb-2">' + forumIcons[title] + ' ' + title + '</div>'
                            + '<div class="text-xs text-gray-600 italic">No threads found.</div>';
                        return;
                    }
                    var items = threads.map(function (t) {
                        var safeSubject = String(t.subject || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                        var safeAuthor = String(t.author || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        var threadUrl = 'https://boardgamegeek.com/thread/' + encodeURIComponent(String(t.id));
                        var dateStr = '';
                        if (t.lastpostdate) {
                            var d = new Date(t.lastpostdate);
                            if (!isNaN(d.getTime())) {
                                dateStr = d.toISOString().slice(0, 10);
                            }
                        }
                        return '<a href="' + threadUrl + '" target="_blank" rel="noopener noreferrer"'
                            + ' class="flex flex-col gap-0.5 py-1.5 border-b border-gray-700/40 last:border-0 hover:bg-gray-800/60 rounded px-1 transition group">'
                            + '<span class="text-xs text-blue-400 group-hover:text-blue-300 leading-snug">' + safeSubject + '</span>'
                            + '<span class="text-[10px] text-gray-600">' + safeAuthor + (dateStr ? ' &middot; ' + dateStr : '') + '</span>'
                            + '</a>';
                    }).join('');
                    el.innerHTML = '<div class="text-xs font-semibold text-gray-400 mb-2">' + forumIcons[title] + ' ' + title + '</div>'
                        + '<div class="flex flex-col">' + items + '</div>';
                });
            })
            .catch(function () {
                ['News', 'General'].forEach(function (title) {
                    var el = document.getElementById('gamestats-forum-' + title);
                    if (el) { el.querySelector('div:last-child').innerHTML = '<span class="text-xs text-gray-600 italic">Could not load.</span>'; }
                });
            });
    }

    // Async: fetch price for the selected game
    var bggIdForPrice = gameStatsData && gameStatsData.game && gameStatsData.game.bggId
        ? String(gameStatsData.game.bggId)
        : null;
    if (bggIdForPrice) {
        var priceRowId = 'gamestats-price-row-' + bggIdForPrice;
        fetch('api/get_game_price.php?bgg_id=' + encodeURIComponent(bggIdForPrice))
            .then(function (res) { return res.json(); })
            .then(function (json) {
                var row = document.getElementById(priceRowId);
                if (!row) { return; }
                if (!json.success || !json.price) {
                    row.querySelector('dd').innerHTML = '<span class="text-gray-600">\u2014</span>';
                    return;
                }
                var p = json.price;
                var priceText = (p.price !== null && p.price !== undefined)
                    ? Number(p.price).toFixed(2) + '\u00a0' + (p.currency || 'EUR')
                    : '\u2014';
                var stockBadge = '';
                if (p.stock === 'Y') {
                    stockBadge = '<span class="ml-1 text-emerald-400 text-xs">in stock</span>';
                } else if (p.stock === 'N') {
                    stockBadge = '<span class="ml-1 text-rose-400 text-xs">out of stock</span>';
                } else if (p.stock === 'P') {
                    stockBadge = '<span class="ml-1 text-amber-400 text-xs">pre-order</span>';
                }
                var linkUrl = p.item_url || null;
                var priceHtml = linkUrl
                    ? '<a href="' + linkUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">' + priceText + '</a>'
                    : '<span class="text-gray-200">' + priceText + '</span>';
                var sourceUrl = p.item_url || 'https://brettspielpreise.de';
                row.querySelector('dd').innerHTML = priceHtml + stockBadge
                    + '<span class="block text-[10px] text-gray-600 mt-0.5">via <a href="' + sourceUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="hover:text-gray-400 underline">brettspielpreise.de</a></span>';
            })
            .catch(function () {
                var row = document.getElementById(priceRowId);
                if (row) { row.querySelector('dd').innerHTML = '<span class="text-gray-600">\u2014</span>'; }
            });
    }
};
