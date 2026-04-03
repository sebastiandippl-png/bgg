window.BGStatsPlayerStats = (function createPlayerStatsModule() {
    var _selectedPlayerKey = null;
    var _allPlayers = [];
    var _currentMatches = [];

    function selectMatch(index) {
        var player = _currentMatches[index];
        if (!player) { return; }
        _selectedPlayerKey = player.key;
        if (window.BGStatsDashboard && typeof window.BGStatsDashboard.switchTab === 'function') {
            window.BGStatsDashboard.switchTab('playerstats');
        }
    }

    function clearPlayer() {
        _selectedPlayerKey = null;
        if (window.BGStatsDashboard && typeof window.BGStatsDashboard.switchTab === 'function') {
            window.BGStatsDashboard.switchTab('playerstats');
        }
    }

    function handleSearchInput(event) {
        var query = String(event.target.value || '').trim().toLowerCase();
        var dropdown = document.getElementById('playerstats-dropdown');
        if (!dropdown) { return; }

        if (!query) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            _currentMatches = [];
            return;
        }

        var matches = _allPlayers
            .filter(function (player) {
                return String(player.name || '').toLowerCase().indexOf(query) !== -1;
            })
            .sort(function (a, b) {
                var aName = String(a.name || '').toLowerCase();
                var bName = String(b.name || '').toLowerCase();
                var aStarts = aName.indexOf(query) === 0;
                var bStarts = bName.indexOf(query) === 0;
                if (aStarts && !bStarts) { return -1; }
                if (!aStarts && bStarts) { return 1; }
                return aName.localeCompare(bName);
            })
            .slice(0, 14);

        _currentMatches = matches;

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500 italic">No players found</div>';
        } else {
            dropdown.innerHTML = matches.map(function (player, index) {
                var safeName = String(player.name || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
                return '<button'
                    + ' class="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3 border-b border-gray-700/40 last:border-0"'
                    + ' onclick="window.BGStatsPlayerStats.selectMatch(' + index + ')"'
                    + '>'
                    + '<span class="flex-1 truncate">' + safeName + '</span>'
                    + '<span class="text-xs text-gray-500 shrink-0">' + player.TotalPlays + ' plays</span>'
                    + '</button>';
            }).join('');
        }

        dropdown.classList.remove('hidden');
    }

    return {
        get selectedPlayerKey() { return _selectedPlayerKey; },
        setAllPlayers: function (players) { _allPlayers = Array.isArray(players) ? players : []; },
        setSelectedPlayerKey: function (key) { _selectedPlayerKey = (key !== null && key !== undefined) ? key : null; },
        selectMatch: selectMatch,
        clearPlayer: clearPlayer,
        handleSearchInput: handleSearchInput
    };
})();

window.renderPlayerStatsTab = function renderPlayerStatsTab(options) {
    var allPlayers = options.allPlayers;
    var playerStatsData = options.playerStatsData;
    var escapeHTML = options.escapeHTML;
    var targetId = options.targetId || 'playerstats-content';

    var container = document.getElementById(targetId);
    if (!container) { return; }

    window.BGStatsPlayerStats.setAllPlayers(allPlayers);

    function fmt(val) {
        if (val === null || val === undefined || val === '') {
            return '<span class="text-gray-600">—</span>';
        }
        return escapeHTML(String(val));
    }

    function gameLink(game, fallbackName) {
        var label = fallbackName || (game && game.name) || 'Unknown Game';
        if (game && game.id) {
            return '<a href="#gamestats/' + encodeURIComponent(game.id) + '" class="text-blue-400 hover:text-blue-300 underline">' + escapeHTML(String(label)) + '</a>';
        }
        return '<span class="text-gray-200">' + escapeHTML(String(label)) + '</span>';
    }

    function renderSearchView() {
        return '<div class="max-w-xl mx-auto pt-8 pb-4 px-2 sm:px-4">'
            + '<h2 class="text-lg font-semibold text-gray-200 mb-4">Search for a player</h2>'
            + '<div class="relative">'
            + '<input'
            + ' id="playerstats-search-input"'
            + ' type="text"'
            + ' placeholder="Start typing a player name…"'
            + ' autocomplete="off"'
            + ' spellcheck="false"'
            + ' class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"'
            + ' oninput="window.BGStatsPlayerStats.handleSearchInput(event)"'
            + ' onblur="window.setTimeout(function(){var d=document.getElementById(\'playerstats-dropdown\');if(d)d.classList.add(\'hidden\');},160)"'
            + ' onfocus="if(this.value.trim())window.BGStatsPlayerStats.handleSearchInput({target:this})"'
            + '>'
            + '<div id="playerstats-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-10 max-h-80 overflow-y-auto"></div>'
            + '</div>'
            + '<p class="text-xs text-gray-600 mt-3">Type a player name to see detailed statistics.</p>'
            + '</div>';
    }

    function renderDetailView(data) {
        var player = data.player;
        var playCount = data.playCount;
        var firstPlay = data.firstPlay;
        var lastPlay = data.lastPlay;
        var mostWonGames = Array.isArray(data.mostWonGames) ? data.mostWonGames : [];
        var recordHighGames = Array.isArray(data.recordHighGames) ? data.recordHighGames : [];
        var recentPlays = Array.isArray(data.recentPlays) ? data.recentPlays : [];

        var firstPlayMarkup = firstPlay
            ? '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">First Play</dt><dd class="text-right">'
                + '<div class="text-gray-200">' + fmt(firstPlay.Date) + '</div>'
                + '<div class="text-xs text-gray-500 mt-0.5">' + gameLink(firstPlay.game, firstPlay.Game) + '</div>'
                + '</dd></div>'
            : '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">First Play</dt><dd class="text-gray-600 text-right">—</dd></div>';

        var lastPlayMarkup = lastPlay
            ? '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Last Play</dt><dd class="text-right">'
                + '<div class="text-gray-200">' + fmt(lastPlay.Date) + '</div>'
                + '<div class="text-xs text-gray-500 mt-0.5">' + gameLink(lastPlay.game, lastPlay.Game) + '</div>'
                + '</dd></div>'
            : '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Last Play</dt><dd class="text-gray-600 text-right">—</dd></div>';

        var summaryBlock = '<div class="rounded-lg border border-gray-700 p-4">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Summary</h3>'
            + '<dl class="space-y-2 text-sm">'
            + '<div class="flex justify-between gap-2"><dt class="text-gray-500 shrink-0">Plays</dt><dd class="text-rose-400 font-bold text-right">' + escapeHTML(String(playCount)) + '</dd></div>'
            + firstPlayMarkup
            + lastPlayMarkup
            + '</dl>'
            + '</div>';

        var winsBlock = '<div class="rounded-lg border border-gray-700 p-4">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Games Won Most Often</h3>'
            + (mostWonGames.length > 0
                ? '<div class="space-y-2">' + mostWonGames.map(function (entry, index) {
                    return '<div class="flex items-center gap-3 text-sm">'
                        + '<span class="text-xs text-gray-600 w-5 text-right shrink-0">' + (index + 1) + '.</span>'
                        + '<span class="flex-1 min-w-0 truncate">' + gameLink(entry.game, entry.gameName) + '</span>'
                        + '<span class="text-amber-400 text-xs shrink-0">' + entry.wins + ' win' + (entry.wins !== 1 ? 's' : '') + '</span>'
                        + '</div>';
                }).join('') + '</div>'
                : '<div class="text-sm text-gray-500 italic">No wins recorded yet.</div>')
            + '</div>';

        var recordsBlock = '<div class="rounded-lg border border-gray-700 p-4 md:col-span-2">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Record High Scores</h3>'
            + (recordHighGames.length > 0
                ? '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + recordHighGames.map(function (entry) {
                    return '<div class="rounded-lg border border-gray-700/60 bg-gray-900/40 p-3">'
                        + '<div class="text-sm font-medium">' + gameLink(entry.game, entry.gameName) + '</div>'
                        + '<div class="mt-2 text-xs text-gray-400 space-y-1">'
                        + '<div class="flex justify-between gap-3"><span class="text-gray-500">High score</span><span class="text-emerald-400">' + escapeHTML(String(entry.score)) + '</span></div>'
                        + '<div class="flex justify-between gap-3"><span class="text-gray-500">Last achieved</span><span>' + fmt(entry.lastAchievedOn) + '</span></div>'
                        + '<div class="flex justify-between gap-3"><span class="text-gray-500">Times matched</span><span>' + escapeHTML(String(entry.timesMatched)) + '</span></div>'
                        + '</div>'
                        + '</div>';
                }).join('') + '</div>'
                : '<div class="text-sm text-gray-500 italic">No record-high scores found for this player.</div>')
            + '</div>';

        var recentPlaysBlock = '<div class="rounded-lg border border-gray-700 p-4 md:col-span-2">'
            + '<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Last Plays</h3>'
            + (recentPlays.length > 0
                ? '<div>' + recentPlays.map(function (play) {
                    var scoreValue = play.matchingScore && play.matchingScore.score !== null && play.matchingScore.score !== undefined && play.matchingScore.score !== ''
                        ? String(play.matchingScore.score)
                        : null;
                    return '<div class="flex items-start gap-3 py-2 border-b border-gray-700/40 last:border-0 text-sm">'
                        + '<span class="text-gray-500 shrink-0 w-24 tabular-nums">' + fmt(play.Date) + '</span>'
                        + '<span class="flex-1 min-w-0">' + gameLink(play.game, play.Game) + '</span>'
                        + '<span class="text-gray-400 shrink-0">' + (scoreValue ? 'Score ' + escapeHTML(scoreValue) : 'No score') + '</span>'
                        + '<span class="' + (play.isWin ? 'text-amber-400' : 'text-gray-600') + ' shrink-0">' + (play.isWin ? 'Win' : '') + '</span>'
                        + '</div>';
                }).join('') + '</div>'
                : '<div class="text-sm text-gray-500 italic">No plays found for this player.</div>')
            + '</div>';

        return '<div>'
            + '<div class="flex items-center gap-3 mb-5">'
            + '<button onclick="window.BGStatsPlayerStats.clearPlayer()" class="text-sm text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 transition">← Search</button>'
            + '</div>'
            + '<div class="flex items-start justify-between gap-4 mb-6">'
            + '<div class="min-w-0 flex-1">'
            + '<h2 class="text-xl font-bold text-gray-100 leading-tight">' + escapeHTML(player.name) + '</h2>'
            + '<p class="text-sm text-gray-500 mt-1">Player statistics across all recorded plays</p>'
            + '</div>'
            + '<div class="shrink-0 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-center">'
            + '<div class="text-xs uppercase tracking-wider text-rose-300">Win Rate</div>'
            + '<div class="text-2xl font-bold text-rose-200 mt-1">' + escapeHTML(String(player.WinRate)) + '%</div>'
            + '</div>'
            + '</div>'
            + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'
            + summaryBlock
            + winsBlock
            + recordsBlock
            + recentPlaysBlock
            + '</div>'
            + '</div>';
    }

    if (!playerStatsData) {
        container.innerHTML = renderSearchView();
        window.setTimeout(function () {
            var input = document.getElementById('playerstats-search-input');
            if (input) { input.focus(); }
        }, 50);
        return;
    }

    container.innerHTML = renderDetailView(playerStatsData);
};