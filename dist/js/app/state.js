window.BGStatsState = (function createStateModule() {
    function createInitialState() {
        return {
            games: [],
            plays: [],
            players: [],
            sort: {
                plays: { col: 'Date', asc: false },
                nextplay: { col: 'lastPlayed', asc: true }
            }
        };
    }

    function createStore(initialState = createInitialState()) {
        let state = initialState;

        return {
            getState() {
                return state;
            },

            replaceData(data) {
                state = {
                    ...state,
                    games: data.games || [],
                    plays: data.plays || [],
                    players: data.players || []
                };
            },

            updateSort(tabId, colKey) {
                const currentSort = state.sort[tabId];
                if (!currentSort) {
                    return null;
                }

                const nextSort = currentSort.col === colKey
                    ? { ...currentSort, asc: !currentSort.asc }
                    : { col: colKey, asc: colKey === 'name' };

                state = {
                    ...state,
                    sort: {
                        ...state.sort,
                        [tabId]: nextSort
                    }
                };

                return nextSort;
            }
        };
    }

    return {
        createInitialState,
        createStore
    };
})();
