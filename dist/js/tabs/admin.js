// Admin tab logic for BGStats Dashboard
// Handles sync button events and admin-only UI

(function initAdminTab() {
    function bindAdminSyncButtons() {
        const syncGamesButton = document.getElementById('admin-sync-games-btn');
        if (syncGamesButton) {
            syncGamesButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggGames) {
                    window.BGStatsDashboard.syncBggGames();
                }
            });
        }

        const syncMetadataButton = document.getElementById('admin-sync-metadata-btn');
        if (syncMetadataButton) {
            syncMetadataButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggMetadata) {
                    window.BGStatsDashboard.syncBggMetadata();
                }
            });
        }

        const syncMetadataDeltaButton = document.getElementById('admin-sync-metadata-delta-btn');
        if (syncMetadataDeltaButton) {
            syncMetadataDeltaButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggMetadataDelta) {
                    window.BGStatsDashboard.syncBggMetadataDelta();
                }
            });
        }

        const syncNewGamesButton = document.getElementById('admin-sync-new-games-btn');
        if (syncNewGamesButton) {
            syncNewGamesButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggNewGames) {
                    window.BGStatsDashboard.syncBggNewGames();
                }
            });
        }

        const syncPlaysButton = document.getElementById('admin-sync-plays-btn');
        if (syncPlaysButton) {
            syncPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggPlays) {
                    window.BGStatsDashboard.syncBggPlays();
                }
            });
        }

        const syncLastPlaysButton = document.getElementById('admin-sync-last-plays-btn');
        if (syncLastPlaysButton) {
            syncLastPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                if (window.BGStatsDashboard && window.BGStatsDashboard.syncBggLastPlays) {
                    window.BGStatsDashboard.syncBggLastPlays();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindAdminSyncButtons);
    } else {
        bindAdminSyncButtons();
    }
})();
