window.BGStatsData = (function createDataModule() {
    function toBoolean(value) {
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
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
        const hasIsBaseGameColumn = gameColumns.includes('isbasegame');
        const hasBggLastModifiedColumn = gameColumns.includes('bgg_lastmodified');
        const hasBestWithColumn = gameColumns.includes('best_with');
        const hasRecommendedWithColumn = gameColumns.includes('recommended_with');

        const result = db.exec(
            `SELECT id, name, bggYear, minPlayerCount, maxPlayerCount, average_rating, modificationDate, bgg_rating,
                weight,
                isExpansion,
                ${hasIsBaseGameColumn ? 'isBaseGame' : 'NULL as isBaseGame'},
                urlThumb, maxPlayTime, minPlayTime, bggId, owned,
                     ${hasBggLastModifiedColumn ? 'bgg_lastmodified' : 'NULL as bgg_lastmodified'},
                     ${hasBestWithColumn ? 'best_with' : 'NULL as best_with'},
                     ${hasRecommendedWithColumn ? 'recommended_with' : 'NULL as recommended_with'}
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
                bggRating: row[7] ? parseFloat(row[7]).toFixed(1) : null,
                weight: row[8] ? parseFloat(row[8]).toFixed(2) : null,
                modificationDate: row[6] || null,
                bggLastModified: row[16] || null,
                latestCollectionHistoryDate: null,
                maxPlayTime: parseInt(row[12], 10) || 0,
                minPlayTime: parseInt(row[13], 10) || 0,
                bggId: row[14] || null,
                isExpansion: toBoolean(row[9]),
                isBaseGame: toBoolean(row[10]),
                owned: toBoolean(row[15]),
                lastPlayed: lastPlayedByGameId[row[0]] || null,
                urlThumb: row[11] || null,
                bestWith: row[17] || null,
                recommendedWith: row[18] || null
            };
        });
    }

    function loadPlayers(db) {
        const playersResult = db.exec('SELECT id, name FROM players');
        const playerMap = {};

        if (playersResult.length > 0) {
            playersResult[0].values.forEach(row => {
                playerMap[row[0]] = { name: row[1], plays: 0, wins: 0 };
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
                        const player = playerMap[score.playerRefId];
                        if (!player) {
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

        return Object.values(playerMap)
            .filter(player => player.plays > 0)
            .map(player => ({
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
