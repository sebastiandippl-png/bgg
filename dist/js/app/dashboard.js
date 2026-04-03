window.BGStatsDashboard = (function createDashboardModule() {
    const store = window.BGStatsState.createStore();
    let db = null;
    let SQL = null;
    let lastSyncedAt = null;
    let activeTabId = 'insights';
    const SYNC_BGG_GAMES_URL = 'api/sync_bgg_games.php';
    const SYNC_BGG_METADATA_URL = 'api/sync_bgg_metadata.php';
    const SYNC_BGG_PLAYS_URL = 'api/sync_bgg_plays.php';
    const SYNC_BGG_LAST_PLAYS_URL = 'api/sync_bgg_last_plays.php';
    const SYNC_BGG_STATUS_URL = 'api/sync_bgg_status.php';
    const TAB_IDS = new Set(['insights', 'plays', 'onceupon', 'nextplay', 'gamestats', 'playerstats', 'schema']);

    function getTabIdFromHash() {
        const hash = String(window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) {
            return null;
        }

        const decoded = decodeURIComponent(hash);
        const slashIndex = decoded.indexOf('/');
        const tabPart = slashIndex !== -1 ? decoded.slice(0, slashIndex) : decoded;
        if (TAB_IDS.has(tabPart)) {
            return tabPart;
        }

        const match = decoded.match(/^tab=(.+)$/i);
        if (match && TAB_IDS.has(match[1])) {
            return match[1];
        }

        return null;
    }

    function getHashSubParam() {
        const hash = String(window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) { return null; }
        const decoded = decodeURIComponent(hash);
        const slashIndex = decoded.indexOf('/');
        return slashIndex !== -1 ? decoded.slice(slashIndex + 1) : null;
    }

    function updateHashForTab(tabId) {
        let subParam = null;
        if (tabId === 'gamestats' && window.BGStatsGameStats && window.BGStatsGameStats.selectedGameId) {
            subParam = String(window.BGStatsGameStats.selectedGameId);
        }
        if (tabId === 'playerstats' && window.BGStatsPlayerStats && window.BGStatsPlayerStats.selectedPlayerKey) {
            subParam = String(window.BGStatsPlayerStats.selectedPlayerKey);
        }
        const nextHash = subParam ? `#${tabId}/${subParam}` : `#${tabId}`;
        if (window.location.hash === nextHash) {
            return;
        }
        window.location.hash = subParam ? `${tabId}/${subParam}` : tabId;
    }

    function escapeHTML(value) {
        if (typeof window.escapeHTMLUtil === 'function') {
            return window.escapeHTMLUtil(value);
        }
        return value == null ? '' : String(value);
    }

    function isValidImageUrl(url) {
        if (typeof window.isValidImageUrlUtil === 'function') {
            return window.isValidImageUrlUtil(url);
        }
        return false;
    }

    function updateLastChangeInfo() {
        const target = document.getElementById('db-last-change');
        if (!target) {
            return;
        }

        const lastRecordedPlayDate = window.BGStatsSelectors.getLastRecordedPlayDate(store.getState());
        target.textContent = lastRecordedPlayDate
            ? `Last recorded play: ${lastRecordedPlayDate.toISOString().split('T')[0]}`
            : 'No play data loaded yet.';
    }

    function formatDateTime(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'unknown';
        }

        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function updateLastSyncedInfo(value = lastSyncedAt) {
        const target = document.getElementById('db-last-synced');
        if (!target) {
            return;
        }

        target.textContent = `Last synced: ${value ? formatDateTime(value) : 'unknown'}`;
    }

    function getSyncProgressElements() {
        return {
            shell: document.getElementById('sync-progress-shell'),
            label: document.getElementById('sync-progress-label'),
            subtext: document.getElementById('sync-progress-subtext'),
            percent: document.getElementById('sync-progress-percent'),
            bar: document.getElementById('sync-progress-bar')
        };
    }

    function clampPercentage(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        return Math.max(0, Math.min(100, Math.round(numeric)));
    }

    function formatSyncCount(current, total, label) {
        const currentValue = Number(current) || 0;
        const totalValue = Number(total) || 0;
        if (totalValue > 0) {
            return `${currentValue}/${totalValue} ${label}`;
        }
        if (currentValue > 0) {
            return `${currentValue} ${label}`;
        }
        return null;
    }

    function getSyncProgressModel(status) {
        if (!status || !status.state) {
            return null;
        }

        const phase = status.phase || status.state;
        const totalGames = Number(status.totalGames) || 0;
        const currentGames = Number(status.currentGames) || 0;
        const totalPlays = Number(status.totalPlays) || 0;
        const currentPlays = Number(status.currentPlays) || 0;
        const currentPage = Number(status.page) || 0;

        let percent = 0;
        let label = 'BGG Sync';
        let tone = 'teal';
        let indeterminate = false;

        if (status.state === 'queued') {
            label = 'Queued';
            percent = 2;
            indeterminate = true;
        } else if (status.state === 'polling' && (phase === 'collection_wait' || phase === 'collection_wait_base' || phase === 'collection_wait_expansions')) {
            label = 'Loading Collection';
            percent = 10;
            indeterminate = true;
        } else if (status.state === 'polling' && phase === 'collection_ready') {
            label = 'Collection Ready';
            percent = 22;
        } else if (status.state === 'polling' && (phase === 'details_fetch' || phase === 'details_retry' || phase === 'details_ready')) {
            label = 'Loading Metadata';
            percent = totalGames > 0 ? 22 + ((currentGames / totalGames) * 38) : 32;
            indeterminate = totalGames === 0;
        } else if (status.state === 'polling' && (phase === 'plays_wait' || phase === 'plays_fetch')) {
            label = 'Loading Plays';
            percent = totalPlays > 0
                ? 60 + ((currentPlays / totalPlays) * 10)
                : Math.min(70, 60 + (currentPage * 2));
            indeterminate = totalPlays === 0;
        } else if (status.state === 'imported' && phase === 'import_prepare') {
            label = 'Preparing Import';
            percent = 72;
        } else if (status.state === 'imported' && phase === 'import_games') {
            label = 'Importing Games';
            percent = totalGames > 0 ? 72 + ((currentGames / totalGames) * 12) : 78;
        } else if (status.state === 'imported' && phase === 'import_plays') {
            label = 'Importing Plays';
            percent = totalPlays > 0 ? 84 + ((currentPlays / totalPlays) * 15) : 90;
        } else if (status.state === 'imported' && phase === 'import_recent_plays') {
            label = 'Importing Last Plays';
            percent = totalPlays > 0 ? 84 + ((currentPlays / totalPlays) * 15) : 90;
        } else if (status.state === 'complete') {
            label = 'Complete';
            percent = 100;
        } else if (status.state === 'error') {
            label = 'Failed';
            percent = 100;
            tone = 'rose';
        }

        const parts = [
            formatSyncCount(currentGames || (status.insertedGames || 0), totalGames || (status.insertedGames || 0), 'games'),
            formatSyncCount(currentPlays || (status.insertedPlays || 0), totalPlays || (status.insertedPlays || 0), 'plays')
        ].filter(Boolean);

        return {
            label,
            detail: parts.join(' • ') || status.message || '',
            percent: clampPercentage(percent),
            tone,
            indeterminate,
            visible: ['queued', 'polling', 'imported', 'complete', 'error'].includes(status.state)
        };
    }

    function renderSyncProgress(status) {
        const elements = getSyncProgressElements();
        if (!elements.shell || !elements.label || !elements.subtext || !elements.percent || !elements.bar) {
            return;
        }

        const model = getSyncProgressModel(status);
        if (!model || !model.visible) {
            elements.shell.classList.add('hidden');
            return;
        }

        elements.shell.classList.remove('hidden');
        elements.label.textContent = model.label;
        elements.subtext.textContent = model.detail;
        elements.percent.textContent = `${model.percent}%`;
        elements.bar.style.width = `${model.indeterminate ? Math.max(model.percent, 18) : model.percent}%`;
        elements.bar.classList.toggle('animate-pulse', model.indeterminate);

        elements.shell.classList.toggle('border-teal-500/20', model.tone === 'teal');
        elements.shell.classList.toggle('bg-teal-500/5', model.tone === 'teal');
        elements.shell.classList.toggle('border-rose-500/20', model.tone === 'rose');
        elements.shell.classList.toggle('bg-rose-500/5', model.tone === 'rose');
        elements.label.classList.toggle('text-teal-300', model.tone === 'teal');
        elements.label.classList.toggle('text-rose-300', model.tone === 'rose');
        elements.subtext.classList.toggle('text-teal-100/80', model.tone === 'teal');
        elements.subtext.classList.toggle('text-rose-100/80', model.tone === 'rose');
        elements.percent.classList.toggle('text-teal-200', model.tone === 'teal');
        elements.percent.classList.toggle('text-rose-200', model.tone === 'rose');
        elements.bar.classList.toggle('from-teal-400', model.tone === 'teal');
        elements.bar.classList.toggle('via-cyan-400', model.tone === 'teal');
        elements.bar.classList.toggle('to-blue-500', model.tone === 'teal');
        elements.bar.classList.toggle('from-rose-400', model.tone === 'rose');
        elements.bar.classList.toggle('via-orange-400', model.tone === 'rose');
        elements.bar.classList.toggle('to-red-500', model.tone === 'rose');
    }

    async function readJsonResponse(response) {
        const rawText = await response.text();
        if (!rawText) {
            return { payload: null, rawText: '' };
        }

        try {
            return {
                payload: JSON.parse(rawText),
                rawText
            };
        } catch (_) {
            return {
                payload: null,
                rawText
            };
        }
    }

    function inferSyncErrorCode(response, payload, rawText, latestStatus) {
        if (payload && payload.error) {
            return String(payload.error);
        }
        if (latestStatus && latestStatus.state === 'error' && latestStatus.message) {
            return String(latestStatus.message);
        }
        if (response.status === 401) {
            return 'unauthorized';
        }
        if (response.status === 405) {
            return 'method_not_allowed';
        }
        if (rawText && rawText.trim()) {
            return 'invalid_sync_response';
        }
        return 'sync_failed';
    }

    function wasStatusUpdatedForCurrentRun(status, syncStartedAtMs) {
        if (!status || !status.updatedAt) {
            return false;
        }

        const updatedAtMs = Date.parse(status.updatedAt);
        if (!Number.isFinite(updatedAtMs)) {
            return false;
        }

        return updatedAtMs >= (syncStartedAtMs - 1000);
    }

    async function waitForTerminalSyncStatus(syncStartedAtMs, pollStatus, options = {}) {
        const maxWaitMs = Number(options.maxWaitMs) || (8 * 60 * 1000);
        const stallThresholdMs = Number(options.stallThresholdMs) || 45000;
        const pollIntervalMs = Number(options.pollIntervalMs) || 1500;
        const deadline = Date.now() + maxWaitMs;
        let lastProgressAt = Date.now();

        while (Date.now() < deadline) {
            const status = await pollStatus();
            if (!status) {
                await new Promise(resolve => window.setTimeout(resolve, pollIntervalMs));
                continue;
            }

            if (wasStatusUpdatedForCurrentRun(status, syncStartedAtMs)) {
                lastProgressAt = Date.now();
            }

            if (status.state === 'complete' && wasStatusUpdatedForCurrentRun(status, syncStartedAtMs)) {
                return status;
            }

            if (status.state === 'error' && wasStatusUpdatedForCurrentRun(status, syncStartedAtMs)) {
                return status;
            }

            if ((Date.now() - lastProgressAt) > stallThresholdMs) {
                return null;
            }

            await new Promise(resolve => window.setTimeout(resolve, pollIntervalMs));
        }

        return null;
    }

    function renderSchema() {
        if (typeof window.renderSchemaTab !== 'function') {
            const container = document.getElementById('content-schema');
            if (container) {
                container.innerHTML = '<div class="text-red-400">Schema renderer not loaded.</div>';
            }
            return;
        }

        const schemaData = window.BGStatsSelectors.getBggSchemaViewModel(db);
        window.renderSchemaTab({
            schemaData,
            escapeHTML,
            containerId: 'content-schema'
        });
    }

    function renderTab(tabId) {
        const state = store.getState();

        if (tabId === 'insights' && typeof window.renderInsightsTab === 'function') {
            window.renderInsightsTab({
                insightsData: window.BGStatsSelectors.getInsightsViewModel(state),
                escapeHTML,
                isValidImageUrl,
                getPlaceholderImageUrl: window.getPlaceholderBoxArtUtil,
                targetId: 'content-insights'
            });
            return;
        }

        if (tabId === 'plays' && typeof window.renderPlaysTab === 'function') {
            window.renderPlaysTab({
                playsData: window.BGStatsSelectors.getRecentPlaysViewModel(state),
                escapeHTML,
                isValidImageUrl,
                getPlaceholderImageUrl: window.getPlaceholderBoxArtUtil,
                targetId: 'plays-table'
            });
            return;
        }

        if (tabId === 'onceupon' && typeof window.renderOnceUponTab === 'function') {
            window.renderOnceUponTab({
                onceUponData: window.BGStatsSelectors.getOnceUponViewModel(state),
                escapeHTML,
                isValidImageUrl,
                getPlaceholderImageUrl: window.getPlaceholderBoxArtUtil,
                targetId: 'onceupon-content'
            });
            return;
        }

        if (tabId === 'nextplay' && typeof window.renderNextplayTab === 'function') {
            const viewModel = window.BGStatsSelectors.getNextplayViewModel(state);
            window.renderNextplayTab({
                groups: viewModel.groups,
                sortConfig: viewModel.sortConfig,
                escapeHTML,
                targetId: 'nextplay-content'
            });
            return;
        }

        if (tabId === 'gamestats' && typeof window.renderGameStatsTab === 'function') {
            const selectedId = window.BGStatsGameStats ? window.BGStatsGameStats.selectedGameId : null;
            window.renderGameStatsTab({
                allGames: state.games,
                allPlayers: state.players,
                gameStatsData: window.BGStatsSelectors.getGameStatsViewModel(state, selectedId),
                escapeHTML,
                isValidImageUrl,
                getPlaceholderImageUrl: window.getPlaceholderBoxArtUtil,
                targetId: 'gamestats-content'
            });
            return;
        }

        if (tabId === 'playerstats' && typeof window.renderPlayerStatsTab === 'function') {
            const selectedPlayerKey = window.BGStatsPlayerStats ? window.BGStatsPlayerStats.selectedPlayerKey : null;
            window.renderPlayerStatsTab({
                allPlayers: state.players,
                playerStatsData: window.BGStatsSelectors.getPlayerStatsViewModel(state, selectedPlayerKey),
                escapeHTML,
                targetId: 'playerstats-content'
            });
            return;
        }
    }

    function setActiveTabStyles(tabId) {
        document.querySelectorAll('.tab-content').forEach(element => {
            element.classList.add('hidden');
        });
        document.querySelectorAll('#nav-tabs button').forEach(button => {
            button.classList.remove('tab-active', 'text-blue-400');
        });

        const content = document.getElementById(`content-${tabId}`);
        const button = document.getElementById(`tab-${tabId}`);
        if (!content || !button) {
            return;
        }

        content.classList.remove('hidden');
        button.classList.add('tab-active', 'text-blue-400');
    }

    function switchTab(tabId, options = {}) {
        const { skipHashUpdate = false } = options;

        if (!TAB_IDS.has(tabId)) {
            tabId = 'insights';
        }

        if (!skipHashUpdate) {
            updateHashForTab(tabId);
        }

        activeTabId = tabId;
        setActiveTabStyles(tabId);

        if (tabId === 'schema') {
            if (!window.__bgstatsAdmin) {
                tabId = 'insights';
                activeTabId = tabId;
                setActiveTabStyles(tabId);
                renderTab(tabId);
                return;
            }
            renderSchema();
            return;
        }

        renderTab(tabId);
    }

    function handleSort(tabId, colKey) {
        const nextSort = store.updateSort(tabId, colKey);
        if (!nextSort) {
            return;
        }

        if (activeTabId === tabId) {
            renderTab(tabId);
        }
    }

    function handleImageError(event) {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) {
            return;
        }

        const fallbackSrc = image.dataset.fallbackSrc;
        if (!fallbackSrc || image.src === fallbackSrc) {
            return;
        }

        image.src = fallbackSrc;
        image.style.objectFit = 'contain';
    }

    function bindEvents() {
        const navTabs = document.getElementById('nav-tabs');
        if (navTabs) {
            navTabs.addEventListener('click', event => {
                const button = event.target.closest('button[data-tab-id]');
                if (!button) {
                    return;
                }

                event.preventDefault();
                switchTab(button.dataset.tabId);
            });
        }

        window.addEventListener('hashchange', () => {
            const tabId = getTabIdFromHash();
            if (!tabId) {
                return;
            }

            if (tabId === 'gamestats') {
                const newGameId = getHashSubParam() || null;
                if (window.BGStatsGameStats) {
                    window.BGStatsGameStats.setSelectedGameId(newGameId);
                }
                switchTab(tabId, { skipHashUpdate: true });
                return;
            }

            if (tabId === 'playerstats') {
                const newPlayerKey = getHashSubParam() || null;
                if (window.BGStatsPlayerStats) {
                    window.BGStatsPlayerStats.setSelectedPlayerKey(newPlayerKey);
                }
                switchTab(tabId, { skipHashUpdate: true });
                return;
            }

            if (tabId === activeTabId) {
                return;
            }

            switchTab(tabId, { skipHashUpdate: true });
        });

        document.addEventListener('click', event => {
            const sortTrigger = event.target.closest('[data-sort-tab][data-sort-col]');
            if (!sortTrigger) {
                return;
            }

            event.preventDefault();
            handleSort(sortTrigger.dataset.sortTab, sortTrigger.dataset.sortCol);
        });

        const syncGamesButton = document.getElementById('admin-sync-games-btn');
        if (syncGamesButton) {
            syncGamesButton.addEventListener('click', event => {
                event.preventDefault();
                syncBggGames();
            });
        }

        const syncMetadataButton = document.getElementById('admin-sync-metadata-btn');
        if (syncMetadataButton) {
            syncMetadataButton.addEventListener('click', event => {
                event.preventDefault();
                syncBggMetadata();
            });
        }

        const syncPlaysButton = document.getElementById('admin-sync-plays-btn');
        if (syncPlaysButton) {
            syncPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                syncBggPlays();
            });
        }

        const syncLastPlaysButton = document.getElementById('admin-sync-last-plays-btn');
        if (syncLastPlaysButton) {
            syncLastPlaysButton.addEventListener('click', event => {
                event.preventDefault();
                syncBggLastPlays();
            });
        }

        document.addEventListener('error', handleImageError, true);
    }

    async function initSqlEngine() {
        const config = {
            locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
        };

        SQL = await initSqlJs(config);

        const loadButton = document.getElementById('server-load-btn');
        if (loadButton) {
            loadButton.disabled = false;
        }
    }

    async function loadDatabaseFromServer() {
        const response = await fetch('api/get_db.php', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            method: 'HEAD'
        });

        if (!response.ok) {
            lastSyncedAt = null;
            updateLastSyncedInfo();
            return null;
        }

        const lastModified = response.headers.get('Last-Modified');
        lastSyncedAt = lastModified ? new Date(lastModified) : null;
        updateLastSyncedInfo();

        const dbResponse = await fetch('api/get_db.php', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!dbResponse.ok) {
            return null;
        }

        const arrayBuffer = await dbResponse.arrayBuffer();
        return new SQL.Database(new Uint8Array(arrayBuffer));
    }

    async function runSyncAction(config) {
        const syncButton = document.getElementById(config.buttonId);
        if (!syncButton) {
            return;
        }

        const originalLabel = syncButton.textContent;
        syncButton.disabled = true;
        syncButton.textContent = config.busyLabel || 'Syncing...';

        const syncStartedAtMs = Date.now();
        let pollTimer = null;
        let statusPollInFlight = false;
        const stopPolling = function stopPolling() {
            if (pollTimer) {
                window.clearInterval(pollTimer);
                pollTimer = null;
            }
        };

        const applySyncStatus = function applySyncStatus(status) {
            const info = document.getElementById('db-last-change');
            if (!info || !status || !status.state) {
                return;
            }

            if (!wasStatusUpdatedForCurrentRun(status, syncStartedAtMs)) {
                return;
            }

            renderSyncProgress(status);

            if (status.state === 'queued') {
                info.textContent = status.message || 'BGG sync queued.';
            } else if (status.state === 'polling') {
                info.textContent = status.message || 'BGG sync polling BGG...';
            } else if (status.state === 'imported') {
                const currentGames = status.currentGames || 0;
                const totalGames = status.totalGames || 0;
                const currentPlays = status.currentPlays || 0;
                const totalPlays = status.totalPlays || 0;
                if ((status.phase || '') === 'import_games') {
                    info.textContent = `Syncing games into bgg.db: ${currentGames}/${totalGames || '?'} imported.`;
                } else if ((status.phase || '') === 'import_plays') {
                    info.textContent = `Syncing plays into bgg.db: ${currentPlays}/${totalPlays || '?'} imported.`;
                } else {
                    info.textContent = status.message || 'Importing synced data into bgg.db...';
                }
            } else if (status.state === 'complete') {
                const insertedGames = status.insertedGames || 0;
                const insertedPlays = status.insertedPlays || 0;
                info.textContent = `BGG sync complete: ${insertedGames} games and ${insertedPlays} plays imported into bgg.db.`;
            } else if (status.state === 'error') {
                info.textContent = `BGG sync failed (${status.message || 'unknown'}).`;
            }
        };

        const pollStatus = async function pollStatus() {
            if (statusPollInFlight) {
                return null;
            }

            statusPollInFlight = true;
            try {
                const statusResponse = await fetch(SYNC_BGG_STATUS_URL, {
                    method: 'GET',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'same-origin',
                    cache: 'no-store'
                });
                if (!statusResponse.ok) {
                    return null;
                }
                const statusPayload = await statusResponse.json();
                applySyncStatus(statusPayload);
                return wasStatusUpdatedForCurrentRun(statusPayload, syncStartedAtMs) ? statusPayload : null;
            } catch (_) {
                return null;
            } finally {
                statusPollInFlight = false;
            }
        };

        const info = document.getElementById('db-last-change');
        if (info) {
            info.textContent = config.startMessage || 'Starting sync...';
        }
        renderSyncProgress({
            state: 'queued',
            phase: 'queued',
            message: config.startMessage || 'Starting sync...',
            updatedAt: new Date(syncStartedAtMs).toISOString(),
            currentGames: 0,
            totalGames: null,
            currentPlays: 0,
            totalPlays: null,
        });

        pollStatus();
        pollTimer = window.setInterval(pollStatus, 1200);

        try {
            const response = await fetch(config.syncUrl, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            });

            const responseBody = await readJsonResponse(response);
            const payload = responseBody.payload;
            const latestStatus = await pollStatus();

            if ((latestStatus && latestStatus.state === 'complete' && wasStatusUpdatedForCurrentRun(latestStatus, syncStartedAtMs)) && (!payload || payload.success !== true)) {
                if (config.reloadDbOnSuccess) {
                    const reloadedDbFromStatus = await loadDatabaseFromServer();
                    if (reloadedDbFromStatus) {
                        hydrateDatabase(reloadedDbFromStatus);
                        switchTab('schema');
                    }
                }

                applySyncStatus(latestStatus);
                return;
            }

            if ((!response.ok || !payload || payload.success !== true)
                && latestStatus
                && latestStatus.state === 'polling'
                && wasStatusUpdatedForCurrentRun(latestStatus, syncStartedAtMs)) {
                const terminalStatus = await waitForTerminalSyncStatus(syncStartedAtMs, pollStatus);
                if (terminalStatus && terminalStatus.state === 'complete') {
                    if (config.reloadDbOnSuccess) {
                        const reloadedDbFromTerminalStatus = await loadDatabaseFromServer();
                        if (reloadedDbFromTerminalStatus) {
                            hydrateDatabase(reloadedDbFromTerminalStatus);
                            switchTab('schema');
                        }
                    }

                    applySyncStatus(terminalStatus);
                    return;
                }

                if (terminalStatus && terminalStatus.state === 'error') {
                    throw new Error(String(terminalStatus.message || 'bgg_sync_failed'));
                }
            }

            if (!response.ok || !payload || !payload.success) {
                const code = inferSyncErrorCode(response, payload, responseBody.rawText, latestStatus);
                throw new Error(code);
            }

            if (config.reloadDbOnSuccess && payload.publishDb !== false) {
                const reloadedDb = await loadDatabaseFromServer();
                if (reloadedDb) {
                    hydrateDatabase(reloadedDb);
                    switchTab('schema');
                }
            }

            applySyncStatus(latestStatus || {
                state: 'complete',
                insertedGames: payload.insertedGames || payload.gameCount || 0,
                insertedPlays: payload.insertedPlays || 0,
            });
        } catch (error) {
            console.error('BGG sync failed:', error);
            const info = document.getElementById('db-last-change');
            if (info) {
                const code = error && error.message ? String(error.message) : 'unknown';
                if (code === 'bgg_xmlapi_bearer_auth_required') {
                    info.textContent = 'BGG sync failed: XML API now requires bearer auth (401/403).';
                } else {
                    info.textContent = `BGG sync failed (${code}).`;
                }
            }
        } finally {
            stopPolling();
            syncButton.disabled = false;
            syncButton.textContent = originalLabel || 'Sync BGG';
        }
    }

    async function syncBggGames() {
        await runSyncAction({
            buttonId: 'admin-sync-games-btn',
            syncUrl: SYNC_BGG_GAMES_URL,
            reloadDbOnSuccess: false,
            busyLabel: 'Getting Games...',
            startMessage: 'Starting games sync...'
        });
    }

    async function syncBggMetadata() {
        await runSyncAction({
            buttonId: 'admin-sync-metadata-btn',
            syncUrl: SYNC_BGG_METADATA_URL,
            reloadDbOnSuccess: false,
            busyLabel: 'Getting Metadata...',
            startMessage: 'Starting metadata sync...'
        });
    }

    async function syncBggPlays() {
        await runSyncAction({
            buttonId: 'admin-sync-plays-btn',
            syncUrl: SYNC_BGG_PLAYS_URL,
            reloadDbOnSuccess: true,
            busyLabel: 'Getting Plays...',
            startMessage: 'Starting plays sync...'
        });
    }

    async function syncBggLastPlays() {
        await runSyncAction({
            buttonId: 'admin-sync-last-plays-btn',
            syncUrl: SYNC_BGG_LAST_PLAYS_URL,
            reloadDbOnSuccess: true,
            busyLabel: 'Getting Last Plays...',
            startMessage: 'Starting last-week plays sync...'
        });
    }

    function hydrateDatabase(database) {
        db = database;
        store.replaceData(window.BGStatsData.loadDashboardData(db));

        const welcomeMessage = document.getElementById('welcome-message');
        const navTabs = document.getElementById('nav-tabs');
        if (welcomeMessage) {
            welcomeMessage.classList.add('hidden');
        }
        if (navTabs) {
            navTabs.classList.remove('hidden');
        }

        updateLastChangeInfo();
        switchTab(activeTabId);
    }

    async function init() {
        bindEvents();
        const tabFromHash = getTabIdFromHash();
        if (tabFromHash) {
            activeTabId = tabFromHash;
            if (tabFromHash === 'gamestats') {
                const gameId = getHashSubParam();
                if (gameId && window.BGStatsGameStats) {
                    window.BGStatsGameStats.setSelectedGameId(gameId);
                }
            } else if (tabFromHash === 'playerstats') {
                const playerKey = getHashSubParam();
                if (playerKey && window.BGStatsPlayerStats) {
                    window.BGStatsPlayerStats.setSelectedPlayerKey(playerKey);
                }
            }
        }
        updateLastSyncedInfo();
        await initSqlEngine();

        try {
            const database = await loadDatabaseFromServer();
            if (database) {
                hydrateDatabase(database);
            }
        } catch (error) {
            console.warn('Database load error:', error);
        }
    }

    return {
        init,
        switchTab,
        handleSort,
        getState: store.getState,
        hydrateDatabase
    };
})();
