window.BGStatsData = (function createDataModule() {
    function toBoolean(value) {
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
    }

    function normalizePlayerName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function loadPlays(db) {
        const result = db.exec(`
            SELECT date(p.playDate) as Date, g.name as Game, p.durationMin as Duration, p.gameRefId as gameId, g.id as matchedGameId, p.rawJson, p.playerScores
            FROM plays p
            LEFT JOIN games g ON p.gameRefId = g.id
        `);

        if (result.length === 0) {
            return { plays: [], lastPlayedByGameId: {} };
        }

        const lastPlayedByGameId = {};
        const plays = result[0].values.map(row => {
            const playDate = row[0];
            const gameId = row[3];
            const matchedGameId = row[4];
            let playerScores = [];
            let gameName = row[1];

            if (!gameName && row[5]) {
                try {
                    const raw = JSON.parse(row[5]);
                    if (raw && typeof raw.gameName === 'string' && raw.gameName.trim() !== '') {
                        gameName = raw.gameName.trim();
                    }
                } catch (_) {
                }
            }

            if (!gameName) {
                gameName = gameId || 'Unknown Game';
            }

            if (!lastPlayedByGameId[gameId] || playDate > lastPlayedByGameId[gameId]) {
                lastPlayedByGameId[gameId] = playDate;
            }

            if (row[6]) {
                try {
                    const parsedScores = JSON.parse(row[6]);
                    if (Array.isArray(parsedScores)) {
                        playerScores = parsedScores;
                    }
                } catch (_) {
                }
            }

            return {
                Date: playDate,
                Game: gameName,
                Duration: row[2],
                durationMin: row[2],
                gameId,
                matchedGameId,
                playerScores,
                timestamp: new Date(playDate).getTime()
            };
        });

        return { plays, lastPlayedByGameId };
    }

    function loadGames(db, lastPlayedByGameId) {
        const gameColumnsResult = db.exec('PRAGMA table_info("games")');
        const gameColumns = gameColumnsResult.length > 0
            ? gameColumnsResult[0].values.map(column => String(column[1]).toLowerCase())
            : [];
        const hasRatingColumn = gameColumns.includes('rating');
        const hasBggRatingColumn = gameColumns.includes('bgg_rating');
        const hasIsBaseGameColumn = gameColumns.includes('isbasegame');
        const hasBggLastModifiedColumn = gameColumns.includes('bgg_lastmodified');
        const hasBestWithColumn = gameColumns.includes('best_with');
        const hasRecommendedWithColumn = gameColumns.includes('recommended_with');
        const hasDesignerColumn = gameColumns.includes('designer');
        const hasPrevOwnedColumn = gameColumns.includes('prev_owned');
        const hasForTradeColumn = gameColumns.includes('for_trade');
        const hasWantColumn = gameColumns.includes('want');
        const hasWantToPlayColumn = gameColumns.includes('want_to_play');
        const hasWantToBuyColumn = gameColumns.includes('want_to_buy');
        const hasWishlistColumn = gameColumns.includes('wishlist');
        const hasPreorderedColumn = gameColumns.includes('preordered');

        const result = db.exec(
            `SELECT id, name, bggYear, minPlayerCount, maxPlayerCount,
                ${hasRatingColumn ? 'rating' : 'NULL as rating'},
                average_rating,
                ${hasBggRatingColumn ? 'bgg_rating' : 'NULL as bgg_rating'},
                modificationDate,
                weight,
                isExpansion,
                ${hasIsBaseGameColumn ? 'isBaseGame' : 'NULL as isBaseGame'},
                urlThumb, maxPlayTime, minPlayTime, bggId, owned,
                     ${hasBggLastModifiedColumn ? 'bgg_lastmodified' : 'NULL as bgg_lastmodified'},
                     ${hasBestWithColumn ? 'best_with' : 'NULL as best_with'},
                     ${hasRecommendedWithColumn ? 'recommended_with' : 'NULL as recommended_with'},
                     ${hasDesignerColumn ? 'designer' : 'NULL as designer'},
                     ${hasPrevOwnedColumn ? 'prev_owned' : '0 as prev_owned'},
                     ${hasForTradeColumn ? 'for_trade' : '0 as for_trade'},
                     ${hasWantColumn ? 'want' : '0 as want'},
                     ${hasWantToPlayColumn ? 'want_to_play' : '0 as want_to_play'},
                     ${hasWantToBuyColumn ? 'want_to_buy' : '0 as want_to_buy'},
                     ${hasWishlistColumn ? 'wishlist' : '0 as wishlist'},
                     ${hasPreorderedColumn ? 'preordered' : '0 as preordered'}
             FROM games`
        );
        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => {
            return {
                id: row[0],
                name: row[1] || 'Unknown',
                year: row[2],
                minPlayers: parseInt(row[3], 10) || 0,
                maxPlayers: parseInt(row[4], 10) || 0,
                rating: row[5] ? parseFloat(row[5]).toFixed(1) : null,
                averageRating: row[6] ? parseFloat(row[6]).toFixed(1) : null,
                geekRating: row[7] ? parseFloat(row[7]).toFixed(1) : null,
                weight: row[9] ? parseFloat(row[9]).toFixed(2) : null,
                modificationDate: row[8] || null,
                bggLastModified: row[17] || null,
                latestCollectionHistoryDate: null,
                maxPlayTime: parseInt(row[13], 10) || 0,
                minPlayTime: parseInt(row[14], 10) || 0,
                bggId: row[15] || null,
                isExpansion: toBoolean(row[10]),
                isBaseGame: toBoolean(row[11]),
                owned: toBoolean(row[16]),
                lastPlayed: lastPlayedByGameId[row[0]] || null,
                urlThumb: row[12] || null,
                bestWith: row[18] || null,
                recommendedWith: row[19] || null,
                designer: row[20] || null,
                prevOwned: toBoolean(row[21]),
                forTrade: toBoolean(row[22]),
                want: toBoolean(row[23]),
                wantToPlay: toBoolean(row[24]),
                wantToBuy: toBoolean(row[25]),
                wishlist: toBoolean(row[26]),
                preordered: toBoolean(row[27])
            };
        });
    }

    function loadPlayers(db) {
        const playersResult = db.exec('SELECT id, name FROM players');
        const playersByKey = {};
        const playersById = {};
        const playersByName = {};

        function registerPlayer(player) {
            playersByKey[player.key] = player;
            if (player.id) {
                playersById[player.id] = player;
            }
            const normalizedName = normalizePlayerName(player.name);
            if (normalizedName) {
                playersByName[normalizedName] = player;
            }
            return player;
        }

        function getOrCreatePlayer(idValue, nameValue) {
            const id = String(idValue || '').trim();
            const name = String(nameValue || '').trim();
            const normalizedName = normalizePlayerName(name);

            if (id && playersById[id]) {
                return playersById[id];
            }
            if (normalizedName && playersByName[normalizedName]) {
                const existingPlayer = playersByName[normalizedName];
                if (id && !existingPlayer.id) {
                    existingPlayer.id = id;
                    existingPlayer.key = `id:${id}`;
                    playersById[id] = existingPlayer;
                    playersByKey[existingPlayer.key] = existingPlayer;
                }
                return existingPlayer;
            }

            return registerPlayer({
                id: id || null,
                key: id ? `id:${id}` : `name:${normalizedName}`,
                name: name || 'Unknown Player',
                plays: 0,
                wins: 0
            });
        }

        if (playersResult.length > 0) {
            playersResult[0].values.forEach(row => {
                getOrCreatePlayer(row[0], row[1]);
            });
        }

        const playsResult = db.exec("SELECT playerScores FROM plays WHERE playerScores IS NOT NULL AND playerScores != ''");
        if (playsResult.length > 0) {
            playsResult[0].values.forEach(row => {
                try {
                    const scores = JSON.parse(row[0]);
                    if (!Array.isArray(scores)) {
                        return;
                    }

                    scores.forEach(score => {
                        const player = getOrCreatePlayer(score.playerRefId, score.playerName);
                        if (!player || !player.name) {
                            return;
                        }

                        player.plays += 1;
                        if (score.winner === true || score.winner === 1 || score.winner === '1') {
                            player.wins += 1;
                        }
                    });
                } catch (_) {
                }
            });
        }

        return Object.values(playersByKey)
            .filter(player => player.plays > 0)
            .sort((first, second) => first.name.localeCompare(second.name))
            .map(player => ({
                id: player.id,
                key: player.key,
                name: player.name,
                TotalPlays: player.plays,
                Wins: player.wins,
                WinRate: parseFloat(((player.wins / player.plays) * 100).toFixed(1))
            }));
    }

    function loadDashboardData(db) {
        const { plays, lastPlayedByGameId } = loadPlays(db);
        const games = loadGames(db, lastPlayedByGameId);
        const players = loadPlayers(db);

        return {
            games,
            plays,
            players
        };
    }

    return {
        loadDashboardData
    };
})();
