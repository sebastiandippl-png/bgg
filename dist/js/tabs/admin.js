// Admin tab logic for BGStats Dashboard
// Handles sync button events and admin-only UI

(function initAdminTab() {
    const SYNC_LOG_URL = 'api/get_sync_log.php';

    const SYNC_TYPE_LABELS = {
        games:          'Get Games',
        metadata:       'Get Metadata',
        plays:          'Get Plays + Build DB',
        new_games:      'Get New Games',
        metadata_delta: 'Metadata Delta',
        last_plays:     'Get Last Plays',
    };

    function formatLogDateTime(value) {
        if (!value) { return '\u2014'; }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) { return String(value); }
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).format(date);
    }

    function renderSyncLog(entries) {
        const tbody = document.getElementById('sync-log-body');
        if (!tbody) { return; }

        if (!entries || entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-3 py-3 text-gray-500 italic">No sync history yet.</td></tr>';
            return;
        }

        const rows = [...entries].reverse().map(entry => {
            const type = SYNC_TYPE_LABELS[entry.type] || String(entry.type || '\u2014');
            const started = formatLogDateTime(entry.startedAt);
            const finished = formatLogDateTime(entry.finishedAt);
            const successBadge = entry.success
                ? '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/60 text-emerald-300">OK</span>'
                : '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-900/60 text-rose-300">Failed</span>';
            return '<tr class="border-t border-gray-700/40 hover:bg-gray-800/40">'
                + '<td class="px-3 py-2 text-gray-200 whitespace-nowrap">' + type + '</td>'
                + '<td class="px-3 py-2 text-gray-400 whitespace-nowrap">' + started + '</td>'
                + '<td class="px-3 py-2 text-gray-400 whitespace-nowrap">' + finished + '</td>'
                + '<td class="px-3 py-2 whitespace-nowrap">' + successBadge + '</td>'
                + '</tr>';
        });
        tbody.innerHTML = rows.join('');
    }

    async function fetchAndRenderSyncLog() {
        try {
            const response = await fetch(SYNC_LOG_URL, {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!response.ok) { return; }
            const data = await response.json();
            if (data && Array.isArray(data.log)) {
                renderSyncLog(data.log);
            }
        } catch (_) {
            // Silently ignore - log is non-critical
        }
    }

    function bindAdminSyncButtons() {
        const syncGamesButton = document.getElementById('admin-sync-games-btn');
        if (syncGamesButton) {
            syncGamesButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggGames) {
                    window.BGStatsDashboard.syncBggGames().finally(fetchAndRenderSyncLog);
                }
            });
        }

        const syncMetadataButton = document.getElementById('admin-sync-metadata-btn');
        if (syncMetadataButton) {
            syncMetadataButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggMetadata) {
                    window.BGStatsDashboard.syncBggMetadata().finally(fetchAndRenderSyncLog);
                }
            });
        }

        const syncMetadataDeltaButton = document.getElementById('admin-sync-metadata-delta-btn');
        if (syncMetadataDeltaButton) {
            syncMetadataDeltaButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggMetadataDelta) {
                    window.BGStatsDashboard.syncBggMetadataDelta().finally(fetchAndRenderSyncLog);
                }
            });
        }

        const syncNewGamesButton = document.getElementById('admin-sync-new-games-btn');
        if (syncNewGamesButton) {
            syncNewGamesButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggNewGames) {
                    window.BGStatsDashboard.syncBggNewGames().finally(fetchAndRenderSyncLog);
                }
            });
        }

        const syncPlaysButton = document.getElementById('admin-sync-plays-btn');
        if (syncPlaysButton) {
            syncPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggPlays) {
                    window.BGStatsDashboard.syncBggPlays().finally(fetchAndRenderSyncLog);
                }
            });
        }

        const syncLastPlaysButton = document.getElementById('admin-sync-last-plays-btn');
        if (syncLastPlaysButton) {
            syncLastPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggLastPlays) {
                    window.BGStatsDashboard.syncBggLastPlays().finally(fetchAndRenderSyncLog);
                }
            });
        }
    }

    function init() {
        bindAdminSyncButtons();
        fetchAndRenderSyncLog();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
