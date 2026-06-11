(function initBggTopGamesTab() {
    'use strict';

    const UPLOAD_URL = 'api/upload_bgg_dump.php';
    const TOP_GAMES_URL = 'api/get_bgg_top_games.php';

    function isAdminUser() {
        return window.__bgstatsAdmin === true;
    }

    function updateAdminUiState() {
        const hint = document.getElementById('bgg-top-games-admin-hint');
        const submitBtn = document.getElementById('bgg-top-games-upload-btn');
        if (!hint || !submitBtn) {
            return;
        }

        if (isAdminUser()) {
            hint.textContent = 'Upload the BoardGameGeek CSV dump. The file is stored in dist/db_storage on the server.';
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            return;
        }

        hint.textContent = 'Sign in as admin to upload CSV dumps.';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
    }

    function escapeHTML(value) {
        if (typeof window.escapeHTMLUtil === 'function') {
            return window.escapeHTMLUtil(value);
        }

        return value == null ? '' : String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function uploadDumpFile(file, statusEl) {
        const payload = new FormData();
        payload.append('dump_csv', file);

        const response = await fetch(UPLOAD_URL, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
            body: payload,
        });

        let result = null;
        try {
            result = await response.json();
        } catch (_) {
            result = null;
        }

        if (!response.ok || !result || !result.success) {
            const errorCode = result && result.error ? String(result.error) : 'upload_failed';
            const message = errorCode === 'unauthorized'
                ? 'Admin authentication required to upload CSV files.'
                : `Upload failed: ${escapeHTML(errorCode)}`;
            statusEl.className = 'mt-3 text-sm text-rose-300';
            statusEl.textContent = message;
            return;
        }

        const savedFile = result.fileName ? String(result.fileName) : 'bgg_dump_latest.csv';
        statusEl.className = 'mt-3 text-sm text-emerald-300';
        statusEl.textContent = `Upload complete. Stored as ${savedFile}.`;

        await loadTopGames();
    }

    async function loadTopGames() {
        const shell = document.getElementById('bgg-top-games-results');
        if (!shell) {
            return;
        }

        shell.innerHTML = '<p class="text-sm text-gray-400">Loading top games...</p>';

        try {
            const response = await fetch(TOP_GAMES_URL, {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
                cache: 'no-store',
            });

            const rawText = await response.text();
            let payload = null;
            try {
                payload = rawText ? JSON.parse(rawText) : null;
            } catch (_) {
                payload = null;
            }

            if (!response.ok || !payload || !payload.success) {
                const errorCode = payload && payload.error ? String(payload.error) : 'top_games_unavailable';
                if (errorCode === 'dump_not_found') {
                    shell.innerHTML = '<p class="text-sm text-gray-500">No uploaded CSV found yet. Upload a dump to see top games.</p>';
                    return;
                }
                const statusInfo = `HTTP ${response.status}`;
                const rawHint = !payload && rawText
                    ? ` (${escapeHTML(rawText.slice(0, 160))})`
                    : '';
                shell.innerHTML = `<p class="text-sm text-rose-300">Failed to load top games: ${escapeHTML(errorCode)} [${statusInfo}]${rawHint}</p>`;
                return;
            }

            const yearGroups = Array.isArray(payload.years) && payload.years.length > 0
                ? payload.years
                : [{
                    year: Number(payload.year) || new Date().getFullYear(),
                    games: Array.isArray(payload.games) ? payload.games : [],
                    count: Number(payload.count) || 0,
                }];

            const hasAnyGames = yearGroups.some(group => Array.isArray(group.games) && group.games.length > 0);
            if (!hasAnyGames) {
                const firstYear = Number(yearGroups[0] && yearGroups[0].year) || (new Date().getFullYear());
                shell.innerHTML = '<div class="rounded-xl border border-gray-700/60 bg-gradient-to-br from-gray-900/80 to-gray-950/80 px-4 py-5">'
                    + `<p class="text-sm text-gray-400">No games found for ${firstYear} and previous years in the uploaded CSV.</p>`
                    + '</div>';
                return;
            }

            const cards = yearGroups.map(group => {
                const year = Number(group.year) || 0;
                const games = Array.isArray(group.games) ? group.games : [];
                if (games.length === 0) {
                    return '<div class="rounded-xl border border-gray-700/60 bg-gradient-to-br from-gray-900/80 to-gray-950/80 px-4 py-4">'
                        + `<div class="text-xs uppercase tracking-[0.18em] text-rose-300">Top 10 of ${year}</div>`
                        + `<p class="mt-2 text-sm text-gray-400">No ranked games found for ${year}.</p>`
                        + '</div>';
                }

                const topRank = Number(games[0].rank) || 0;
                const avgGeekRating = games.reduce((sum, game) => {
                    const value = Number(game.geek_rating);
                    return Number.isFinite(value) ? (sum + value) : sum;
                }, 0) / Math.max(games.length, 1);

                const rows = games.map(game => {
                    const gameId = Number(game.id) || 0;
                    const gameName = escapeHTML(String(game.name || 'Unknown game'));
                    const rank = Number(game.rank) || 0;
                    const geekRatingValue = Number(game.geek_rating);
                    const geekRating = Number.isFinite(geekRatingValue)
                        ? geekRatingValue.toFixed(5)
                        : 'n/a';
                    const href = gameId > 0
                        ? `https://boardgamegeek.com/boardgame/${gameId}`
                        : 'https://boardgamegeek.com';

                    let rankTone = 'bg-slate-700/70 text-slate-200';
                    if (rank === 1) {
                        rankTone = 'bg-amber-500/20 text-amber-300';
                    } else if (rank === 2) {
                        rankTone = 'bg-gray-300/20 text-gray-200';
                    } else if (rank === 3) {
                        rankTone = 'bg-orange-500/20 text-orange-300';
                    }

                    return '<tr class="border-t border-gray-700/60 hover:bg-gray-800/50 transition-colors">'
                        + '<td class="px-3 py-3">'
                        + `<span class="inline-flex min-w-[2.2rem] justify-center rounded-full px-2 py-1 text-xs font-semibold ${rankTone}">${rank}</span>`
                        + '</td>'
                        + `<td class="px-3 py-3 text-gray-100"><a href="${href}" target="_blank" rel="noopener noreferrer" class="hover:text-sky-300 underline decoration-slate-500/60 underline-offset-2">${gameName}</a></td>`
                        + `<td class="px-3 py-3 text-gray-200 font-medium">${escapeHTML(geekRating)}</td>`
                        + '</tr>';
                }).join('');

                return '<div class="rounded-xl border border-gray-700/70 bg-gradient-to-br from-gray-900/80 to-gray-950/80 shadow-[0_8px_28px_rgba(0,0,0,0.35)] overflow-hidden">'
                    + '<div class="px-4 py-3 border-b border-gray-700/60 bg-gray-900/70">'
                    + '<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">'
                    + `<div class="text-xs uppercase tracking-[0.18em] text-rose-300">Top 10 of ${year}</div>`
                    + '<div class="flex flex-wrap gap-2 text-xs">'
                    + `<span class="rounded-full bg-sky-500/15 text-sky-200 px-2.5 py-1 border border-sky-500/30">Best Rank: #${topRank || 'n/a'}</span>`
                    + `<span class="rounded-full bg-emerald-500/15 text-emerald-200 px-2.5 py-1 border border-emerald-500/30">Avg Geek Rating: ${Number.isFinite(avgGeekRating) ? avgGeekRating.toFixed(5) : 'n/a'}</span>`
                    + '</div>'
                    + '</div>'
                    + '<p class="mt-2 text-xs text-gray-400">Sorted by overall rank ascending (lowest rank first).</p>'
                    + '</div>'
                    + '<div class="overflow-x-auto">'
                    + '<table class="w-full text-sm text-left">'
                    + '<thead><tr class="text-gray-400">'
                    + '<th class="px-3 py-2 font-semibold uppercase tracking-wide text-[11px]">Rank</th>'
                    + '<th class="px-3 py-2 font-semibold uppercase tracking-wide text-[11px]">Game</th>'
                    + '<th class="px-3 py-2 font-semibold uppercase tracking-wide text-[11px]">Geek Rating</th>'
                    + '</tr></thead>'
                    + `<tbody>${rows}</tbody>`
                    + '</table>'
                    + '</div>'
                    + '</div>';
            }).join('');

            const cacheBadge = payload.cached === true
                ? '<span class="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">Cached</span>'
                : '<span class="rounded-full border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200">Fresh</span>';
            const computedAtRaw = typeof payload.computedAt === 'string' ? payload.computedAt : '';
            let computedAtLabel = '';
            if (computedAtRaw) {
                const parsed = new Date(computedAtRaw);
                if (!Number.isNaN(parsed.getTime())) {
                    computedAtLabel = `<span class="text-[11px] text-gray-400">Computed ${escapeHTML(parsed.toLocaleString())}</span>`;
                }
            }

            shell.innerHTML = '<div class="flex items-center justify-between mb-3">'
                + '<p class="text-xs text-gray-400 uppercase tracking-[0.18em]">Current Year + Previous 10 Years</p>'
                + '<div class="flex items-center gap-3">'
                + computedAtLabel
                + cacheBadge
                + '</div>'
                + '</div>'
                + `<div class="grid grid-cols-1 gap-4">${cards}</div>`;
        } catch (_) {
            shell.innerHTML = '<div class="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3">'
                + '<p class="text-sm text-rose-300">Failed to load top games due to a network error.</p>'
                + '</div>';
            }
    }

    function bindUploadForm() {
        const form = document.getElementById('bgg-top-games-upload-form');
        const fileInput = document.getElementById('bgg-top-games-upload-input');
        const submitBtn = document.getElementById('bgg-top-games-upload-btn');
        const statusEl = document.getElementById('bgg-top-games-upload-status');

        if (!form || !fileInput || !submitBtn || !statusEl) {
            return;
        }

        if (form.dataset.bound === '1') {
            return;
        }
        form.dataset.bound = '1';

        form.addEventListener('submit', async event => {
            event.preventDefault();

            if (!isAdminUser()) {
                statusEl.className = 'mt-3 text-sm text-rose-300';
                statusEl.textContent = 'Admin authentication required to upload CSV files.';
                return;
            }

            const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
            if (!selectedFile) {
                statusEl.className = 'mt-3 text-sm text-amber-300';
                statusEl.textContent = 'Select a CSV file before uploading.';
                return;
            }

            const lowerName = String(selectedFile.name || '').toLowerCase();
            if (!lowerName.endsWith('.csv')) {
                statusEl.className = 'mt-3 text-sm text-amber-300';
                statusEl.textContent = 'Only CSV files are allowed.';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
            statusEl.className = 'mt-3 text-sm text-sky-300';
            statusEl.textContent = 'Uploading CSV dump...';

            try {
                await uploadDumpFile(selectedFile, statusEl);
            } catch (_) {
                statusEl.className = 'mt-3 text-sm text-rose-300';
                statusEl.textContent = 'Upload failed due to a network error.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                updateAdminUiState();
            }
        });

        updateAdminUiState();
    }

    window.renderBggTopGamesTab = function renderBggTopGamesTab({ targetId = 'bggtopgames-content' } = {}) {
        const target = document.getElementById(targetId);
        if (!target) {
            return;
        }

        target.innerHTML = `
            <section class="rounded-xl border border-rose-900/40 bg-gradient-to-br from-gray-900/70 via-gray-900/55 to-gray-950/75 p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                <div class="flex flex-col gap-4">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h2 class="text-lg sm:text-xl font-semibold text-rose-300">BGG Top Games</h2>
                            <p class="mt-1 text-xs text-gray-500 uppercase tracking-[0.2em]">Live from uploaded CSV</p>
                            <p id="bgg-top-games-admin-hint" class="mt-2 text-xs sm:text-sm text-gray-400"></p>
                        </div>
                        <span class="hidden sm:inline-flex rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-200">11-Year Window</span>
                    </div>
                    <form id="bgg-top-games-upload-form" class="flex flex-col gap-3 rounded-lg border border-gray-700/60 bg-gray-900/35 p-3 sm:p-4">
                        <label for="bgg-top-games-upload-input" class="text-xs sm:text-sm text-gray-300">BoardGameGeek CSV dump</label>
                        <input id="bgg-top-games-upload-input" name="dump_csv" type="file" accept=".csv,text/csv" class="block w-full rounded-md border border-gray-700 bg-gray-800/80 px-3 py-2 text-sm text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-gray-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-100 hover:file:bg-gray-600">
                        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                            <button id="bgg-top-games-upload-btn" type="submit" class="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-rose-500 hover:to-orange-400 active:scale-95 transition">
                                Upload CSV Dump
                            </button>
                            <span class="text-xs text-gray-500">Stored filename: bgg_dump_latest.csv</span>
                        </div>
                        <p id="bgg-top-games-upload-status" class="mt-1 text-sm text-gray-400"></p>
                    </form>
                    <div id="bgg-top-games-results" class="mt-2"></div>
                </div>
            </section>
        `;

        bindUploadForm();
        updateAdminUiState();
        loadTopGames();
    };

    window.addEventListener('bgstats:auth-changed', updateAdminUiState);
})();
