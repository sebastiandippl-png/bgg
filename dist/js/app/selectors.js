window.BGStatsSelectors = (function createSelectorModule() {
    function getLastRecordedPlayDate(state) {
        const timestamps = state.plays
            .map(play => play.Date)
            .filter(date => date)
            .map(date => new Date(date))
            .filter(date => !Number.isNaN(date.getTime()))
            .map(date => date.getTime());

        if (timestamps.length === 0) {
            return null;
        }

        return new Date(Math.max(...timestamps));
    }

    function getInsightsViewModel(state) {
        const isBaseGame = game => game.isBaseGame === true || game.isExpansion !== true;
        const isPureExpansion = game => game.isExpansion === true && !isBaseGame(game);

        const baseOwnedGames = state.games.filter(game => game.owned && isBaseGame(game)).length;
        const ownedExpansions = state.games.filter(game => game.owned && isPureExpansion(game)).length;
        const totalPlays = state.plays.length;
        const playCounts = {};

        state.plays.forEach(play => {
            playCounts[play.gameId] = (playCounts[play.gameId] || 0) + 1;
        });

        const counts = Object.values(playCounts).sort((a, b) => b - a);
        let hIndex = 0;
        for (let index = 0; index < counts.length; index += 1) {
            if (counts[index] >= index + 1) {
                hIndex = index + 1;
            } else {
                break;
            }
        }

        const preferredNearMissPlayCount = hIndex > 0 ? hIndex - 1 : null;
        const availableLowerPlayCounts = hIndex > 0
            ? [...new Set(state.games
                .map(game => playCounts[game.id] || 0)
                .filter(count => count < hIndex))].sort((first, second) => second - first)
            : [];
        const nearMissPlayCount = preferredNearMissPlayCount !== null && availableLowerPlayCounts.includes(preferredNearMissPlayCount)
            ? preferredNearMissPlayCount
            : (availableLowerPlayCounts[0] ?? null);

        const nearMissGames = nearMissPlayCount === null
            ? []
            : state.games
                .filter(game => (playCounts[game.id] || 0) === nearMissPlayCount)
                .map(game => ({ name: game.name, playCount: nearMissPlayCount }))
                .sort((first, second) => first.name.localeCompare(second.name));

        const exactGames = hIndex > 0
            ? state.games
                .filter(game => (playCounts[game.id] || 0) === hIndex)
                .map(game => ({ name: game.name, playCount: hIndex }))
                .sort((first, second) => first.name.localeCompare(second.name))
            : [];

        const latestOwnedPurchase = [...state.games]
            .filter(game => game.owned && game.latestCollectionHistoryDate)
            .sort((first, second) => Number(second.latestCollectionHistoryDate) - Number(first.latestCollectionHistoryDate))[0] || null;

        const lastModifiedGame = [...state.games]
                .filter(game => game.owned && game.bggLastModified)
            .sort((first, second) => new Date(second.bggLastModified) - new Date(first.bggLastModified))[0] || null;

        const anneNames = new Set(['anne']);
        const sebastianNames = new Set(['seb', 'sebastian']);
        const anneVsSebWindowDays = 30;
        const anneVsSebCutoff = new Date();
        anneVsSebCutoff.setDate(anneVsSebCutoff.getDate() - anneVsSebWindowDays);
        const anneVsSebStats = state.plays.reduce((accumulator, play) => {
            const playDate = play.Date ? new Date(play.Date) : null;
            if (!playDate || Number.isNaN(playDate.getTime()) || playDate < anneVsSebCutoff) {
                return accumulator;
            }

            const scores = Array.isArray(play.playerScores) ? play.playerScores : [];
            if (scores.length === 0) {
                return accumulator;
            }

            const normalizedPlayers = [...new Set(scores
                .map(score => String(score.playerName || '').trim().toLowerCase())
                .filter(name => name !== ''))];

            if (normalizedPlayers.length !== 2) {
                return accumulator;
            }

            const hasAnne = normalizedPlayers.some(name => anneNames.has(name));
            const hasSebastian = normalizedPlayers.some(name => sebastianNames.has(name));
            if (!hasAnne || !hasSebastian) {
                return accumulator;
            }

            accumulator.playsCount += 1;

            scores.forEach(score => {
                const playerName = String(score.playerName || '').trim().toLowerCase();
                const isWinner = score.winner === true || score.winner === 1 || score.winner === '1';
                if (!isWinner) {
                    return;
                }
                if (anneNames.has(playerName)) {
                    accumulator.anneWins += 1;
                }
                if (sebastianNames.has(playerName)) {
                    accumulator.sebastianWins += 1;
                }
            });

            return accumulator;
        }, {
            playsCount: 0,
            anneWins: 0,
            sebastianWins: 0,
        });

        const anneVsSebLeader = anneVsSebStats.anneWins === anneVsSebStats.sebastianWins
            ? null
            : (anneVsSebStats.anneWins > anneVsSebStats.sebastianWins ? 'anne' : 'sebastian');

        const anneVsSeb = {
            playsCount: anneVsSebStats.playsCount,
            anneWins: anneVsSebStats.anneWins,
            sebastianWins: anneVsSebStats.sebastianWins,
            leader: anneVsSebLeader,
            windowDays: anneVsSebWindowDays,
            leaderLabel: anneVsSebLeader === 'anne'
                ? 'Anne leads'
                : (anneVsSebLeader === 'sebastian' ? 'Sebastian leads' : 'Currently tied'),
        };

        return {
            hIndex,
            totalPlays,
            baseOwnedGames,
            ownedExpansions,
            nearMissGames,
            exactGames,
            latestOwnedPurchase,
            lastModifiedGame,
            anneVsSeb
        };
    }

    function getRecentPlaysViewModel(state) {
        const sortedPlays = window.sortDataUtil(state.plays, state.sort.plays);
        const gamesById = new Map(state.games.map(game => [game.id, game]));

        return sortedPlays.slice(0, 25).map(play => ({
            ...play,
            game: gamesById.get(play.gameId) || null
        }));
    }

    function getNextplayViewModel(state) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const eligibleGames = state.games.filter(game => {
            if (game.isExpansion || !game.owned) {
                return false;
            }
            if (!game.lastPlayed) {
                return true;
            }
            return new Date(game.lastPlayed) < oneYearAgo;
        });

        const complexGames = eligibleGames.filter(game => game.minPlayTime > 30 && game.maxPlayTime > 90);
        const mediumGames = eligibleGames.filter(game => game.minPlayTime > 30 && game.maxPlayTime > 60 && game.maxPlayTime <= 90);
        const lightGames = eligibleGames.filter(game => !(game.minPlayTime > 30 && game.maxPlayTime > 60));

        return {
            sortConfig: state.sort.nextplay,
            groups: [
                {
                    id: 'complex',
                    title: 'Complex (min > 30 & max > 90)',
                    titleClass: 'text-blue-400',
                    games: window.sortDataUtil(complexGames, state.sort.nextplay)
                },
                {
                    id: 'medium',
                    title: 'Medium (min > 30 & max > 60)',
                    titleClass: 'text-green-400',
                    games: window.sortDataUtil(mediumGames, state.sort.nextplay)
                },
                {
                    id: 'light',
                    title: 'Light (max ≤ 60)',
                    titleClass: 'text-yellow-400',
                    games: window.sortDataUtil(lightGames, state.sort.nextplay)
                }
            ]
        };
    }

    function toDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getOnceUponViewModel(state) {
        const gamesById = new Map(state.games.map(game => [game.id, game]));
        const today = new Date();

        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const fiveYearsAgo = new Date(today);
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

        const dayCards = [
            {
                id: 'week_ago',
                title: 'Played Today One Week Ago',
                dateLabel: toDateKey(oneWeekAgo),
                targetDateKey: toDateKey(oneWeekAgo),
                titleClass: 'text-cyan-300'
            },
            {
                id: 'year_ago',
                title: 'Played Today One Year Ago',
                dateLabel: toDateKey(oneYearAgo),
                targetDateKey: toDateKey(oneYearAgo),
                titleClass: 'text-fuchsia-300'
            },
            {
                id: 'five_years_ago',
                title: 'Played Today 5 Years Ago',
                dateLabel: toDateKey(fiveYearsAgo),
                targetDateKey: toDateKey(fiveYearsAgo),
                titleClass: 'text-amber-300'
            }
        ];

        const cards = dayCards.map(card => {
            const plays = state.plays
                .filter(play => String(play.Date || '') === card.targetDateKey)
                .sort((first, second) => (Number(second.timestamp) || 0) - (Number(first.timestamp) || 0))
                .map(play => ({
                    ...play,
                    game: gamesById.get(play.gameId) || null
                }));

            return {
                id: card.id,
                title: card.title,
                dateLabel: card.dateLabel,
                titleClass: card.titleClass,
                plays
            };
        });

        return {
            cards
        };
    }

    function toJsonStructure(value, depth) {
        const currentDepth = depth || 0;
        if (currentDepth > 6) return '...';
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            if (value.length === 0) return [];
            let mergedItemShape = null;
            value.forEach(item => {
                mergedItemShape = mergeJsonStructures(mergedItemShape, toJsonStructure(item, currentDepth + 1));
            });
            return [mergedItemShape || 'unknown'];
        }
        if (typeof value === 'object') {
            const structure = {};
            Object.keys(value).forEach(key => {
                structure[key] = toJsonStructure(value[key], currentDepth + 1);
            });
            return structure;
        }
        return typeof value;
    }

    function isPlainObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function mergeAsUnion(first, second) {
        const firstVariants = isPlainObject(first) && Array.isArray(first.anyOf) ? first.anyOf : [first];
        const secondVariants = isPlainObject(second) && Array.isArray(second.anyOf) ? second.anyOf : [second];
        const merged = [];
        const seen = new Set();

        [...firstVariants, ...secondVariants].forEach(variant => {
            const key = JSON.stringify(variant);
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(variant);
            }
        });

        return { anyOf: merged };
    }

    function mergeJsonStructures(first, second) {
        if (first === null || first === undefined) return second;
        if (second === null || second === undefined) return first;

        if (JSON.stringify(first) === JSON.stringify(second)) {
            return first;
        }

        if (isPlainObject(first) && Array.isArray(first.anyOf)) {
            return mergeAsUnion(first, second);
        }

        if (isPlainObject(second) && Array.isArray(second.anyOf)) {
            return mergeAsUnion(first, second);
        }

        if (Array.isArray(first) && Array.isArray(second)) {
            return [mergeJsonStructures(first[0], second[0])];
        }

        if (isPlainObject(first) && isPlainObject(second)) {
            const merged = { ...first };
            Object.keys(second).forEach(key => {
                merged[key] = mergeJsonStructures(merged[key], second[key]);
            });
            return merged;
        }

        return mergeAsUnion(first, second);
    }

    function parseJsonIfPossible(rawValue) {
        if (rawValue === null || rawValue === undefined) return null;
        const asText = String(rawValue).trim();
        if (!(asText.startsWith('{') || asText.startsWith('['))) return null;
        try {
            return JSON.parse(asText);
        } catch (_) {
            return null;
        }
    }

    function getSampleRow(db, tableName) {
        const tableInfo = db.exec(`PRAGMA table_info("${tableName}")`);
        const tableRows = db.exec(`SELECT * FROM "${tableName}" LIMIT 1`);
        if (tableInfo.length === 0 || tableRows.length === 0 || tableRows[0].values.length === 0) {
            return null;
        }

        const columnNames = tableInfo[0].values.map(col => col[1]);
        const rowValues = tableRows[0].values[0];
        const mappedRow = {};

        columnNames.forEach((columnName, index) => {
            const rawValue = rowValues[index];
            const parsedJson = parseJsonIfPossible(rawValue);
            mappedRow[columnName] = parsedJson !== null ? parsedJson : rawValue;
        });

        return mappedRow;
    }

    function getJsonStructureFromAllRows(db, tableName, colName) {
        const allValuesResult = db.exec(`SELECT "${colName}" FROM "${tableName}" WHERE "${colName}" IS NOT NULL AND trim(CAST("${colName}" AS TEXT)) != ''`);
        if (allValuesResult.length === 0 || allValuesResult[0].values.length === 0) {
            return null;
        }

        let mergedStructure = null;
        allValuesResult[0].values.forEach(row => {
            const parsed = parseJsonIfPossible(row[0]);
            if (parsed !== null && typeof parsed === 'object') {
                mergedStructure = mergeJsonStructures(mergedStructure, toJsonStructure(parsed));
            }
        });

        return mergedStructure;
    }

    function getTableSchema(db, tableName) {
        const tableInfo = db.exec(`PRAGMA table_info("${tableName}")`);
        if (tableInfo.length === 0 || tableInfo[0].values.length === 0) {
            return null;
        }

        return {
            tableName,
            columns: tableInfo[0].values.map(col => ({
                cid: col[0],
                name: col[1],
                type: col[2] || 'TEXT',
                notNull: col[3] === 1,
                defaultValue: col[4],
                primaryKey: col[5] === 1,
            }))
        };
    }

    function getBggSchemaViewModel(db) {
        if (!db) {
            return {
                tables: [],
                sampleGameJson: null,
                samplePlayJson: null,
                message: 'No database loaded.'
            };
        }

        const gamesSchema = getTableSchema(db, 'games');
        const playsSchema = getTableSchema(db, 'plays');
        if (!gamesSchema && !playsSchema) {
            return {
                tables: [],
                sampleGameJson: null,
                samplePlayJson: null,
                message: 'Tables "games" and "plays" do not exist in the current database.'
            };
        }

        let sampleGameJson = null;
        if (gamesSchema) {
            const sampleRawResult = db.exec('SELECT rawJson FROM "games" WHERE owned = 1 AND rawJson IS NOT NULL AND trim(CAST(rawJson AS TEXT)) != "" LIMIT 1');
            if (sampleRawResult.length > 0 && sampleRawResult[0].values.length > 0) {
                const raw = sampleRawResult[0].values[0][0];
                sampleGameJson = parseJsonIfPossible(raw);
            }

            if (!sampleGameJson) {
                const ownedSampleResult = db.exec('SELECT * FROM "games" WHERE owned = 1 LIMIT 1');
                if (ownedSampleResult.length > 0 && ownedSampleResult[0].values.length > 0) {
                    const tableInfo = db.exec('PRAGMA table_info("games")');
                    if (tableInfo.length > 0 && tableInfo[0].values.length > 0) {
                        const columnNames = tableInfo[0].values.map(col => col[1]);
                        const rowValues = ownedSampleResult[0].values[0];
                        const mappedRow = {};
                        columnNames.forEach((columnName, index) => {
                            const rawValue = rowValues[index];
                            const parsedJson = parseJsonIfPossible(rawValue);
                            mappedRow[columnName] = parsedJson !== null ? parsedJson : rawValue;
                        });
                        sampleGameJson = mappedRow;
                    }
                }
            }

        }

        let samplePlayJson = null;
        if (playsSchema) {
            const samplePlayRawResult = db.exec('SELECT p.rawJson FROM "plays" p INNER JOIN "games" g ON p.gameRefId = g.id WHERE g.owned = 1 AND p.rawJson IS NOT NULL AND trim(CAST(p.rawJson AS TEXT)) != "" LIMIT 1');
            if (samplePlayRawResult.length > 0 && samplePlayRawResult[0].values.length > 0) {
                const raw = samplePlayRawResult[0].values[0][0];
                samplePlayJson = parseJsonIfPossible(raw);
            }

        }

        return {
            tables: [gamesSchema, playsSchema].filter(Boolean),
            sampleGameJson,
            samplePlayJson,
            message: null
        };
    }

    function getGameStatsViewModel(state, gameId) {
        if (gameId === null || gameId === undefined) {
            return null;
        }

        const game = state.games.find(g => String(g.id) === String(gameId));
        if (!game) {
            return null;
        }

        const gamePlays = state.plays.filter(play => String(play.gameId) === String(gameId));
        const playCount = gamePlays.length;

        const playDates = gamePlays.map(p => p.Date).filter(Boolean).sort();
        const lastPlayed = playDates[playDates.length - 1] || null;
        const firstPlayed = playDates[0] || null;
        const validDurations = gamePlays
            .map(play => Number(play.durationMin !== undefined ? play.durationMin : play.Duration))
            .filter(duration => Number.isFinite(duration) && duration > 0);
        const shortestPlaytimeMin = validDurations.length > 0 ? Math.min(...validDurations) : null;
        const longestPlaytimeMin = validDurations.length > 0 ? Math.max(...validDurations) : null;
        const averagePlaytimeMin = validDurations.length > 0
            ? (validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length)
            : null;

        const allScores = [];
        const winningScores = [];
        const scoreEntries = [];
        const playerStatsMap = {};

        gamePlays.forEach(play => {
            const scores = Array.isArray(play.playerScores) ? play.playerScores : [];
            scores.forEach(score => {
                const name = String(score.playerName || '').trim();
                if (!name) { return; }

                if (!playerStatsMap[name]) {
                    playerStatsMap[name] = { name, plays: 0, wins: 0 };
                }
                playerStatsMap[name].plays += 1;

                const isWinner = score.winner === true || score.winner === 1 || score.winner === '1';
                if (isWinner) {
                    playerStatsMap[name].wins += 1;
                }

                if (score.score !== null && score.score !== undefined && score.score !== '') {
                    const numScore = parseFloat(score.score);
                    if (Number.isFinite(numScore)) {
                        allScores.push(numScore);
                        scoreEntries.push({ name, score: numScore });
                        if (isWinner) {
                            winningScores.push(numScore);
                        }
                    }
                }
            });
        });

        const hasScores = allScores.length > 0;
        const avgScore = hasScores ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
        const highScore = hasScores ? Math.max(...allScores) : null;
        const lowScore = hasScores ? Math.min(...allScores) : null;
        const highScorePlayers = hasScores
            ? [...new Set(scoreEntries
                .filter(entry => entry.score === highScore)
                .map(entry => entry.name))].sort((a, b) => a.localeCompare(b))
            : [];
        const lowScorePlayers = hasScores
            ? [...new Set(scoreEntries
                .filter(entry => entry.score === lowScore)
                .map(entry => entry.name))].sort((a, b) => a.localeCompare(b))
            : [];
        const avgWinningScore = winningScores.length > 0
            ? winningScores.reduce((a, b) => a + b, 0) / winningScores.length
            : null;

        const players = Object.values(playerStatsMap)
            .sort((a, b) => b.wins - a.wins || b.plays - a.plays || a.name.localeCompare(b.name));

        const recentPlays = [...gamePlays]
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 15);

        return {
            game,
            playCount,
            lastPlayed,
            firstPlayed,
            shortestPlaytimeMin,
            longestPlaytimeMin,
            averagePlaytimeMin,
            avgScore,
            highScore,
            highScorePlayers,
            lowScore,
            lowScorePlayers,
            avgWinningScore,
            players,
            recentPlays
        };
    }

    function normalizePlayerName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getPlayerStatsViewModel(state, playerKey) {
        if (playerKey === null || playerKey === undefined) {
            return null;
        }

        const player = state.players.find(entry => String(entry.key) === String(playerKey));
        if (!player) {
            return null;
        }

        const gamesById = new Map(state.games.map(game => [game.id, game]));
        const playerNameKey = normalizePlayerName(player.name);
        const playerId = player.id ? String(player.id) : null;

        function getMatchingScore(play) {
            const scores = Array.isArray(play.playerScores) ? play.playerScores : [];
            return scores.find(score => {
                const scoreId = String(score.playerRefId || '').trim();
                const scoreName = normalizePlayerName(score.playerName);
                if (playerId && scoreId === playerId) {
                    return true;
                }
                return scoreName !== '' && scoreName === playerNameKey;
            }) || null;
        }

        const playerPlays = state.plays
            .map(play => {
                const matchingScore = getMatchingScore(play);
                if (!matchingScore) {
                    return null;
                }
                return {
                    ...play,
                    game: gamesById.get(play.gameId) || null,
                    matchingScore,
                    isWin: matchingScore.winner === true || matchingScore.winner === 1 || matchingScore.winner === '1'
                };
            })
            .filter(Boolean);

        const playCount = playerPlays.length;
        const sortedByDateAsc = [...playerPlays].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const sortedByDateDesc = [...playerPlays].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const firstPlay = sortedByDateAsc[0] || null;
        const lastPlay = sortedByDateDesc[0] || null;

        const winsByGame = {};
        playerPlays.forEach(play => {
            if (!play.isWin) {
                return;
            }
            const gameId = String(play.gameId || '');
            if (!winsByGame[gameId]) {
                winsByGame[gameId] = {
                    gameId,
                    gameName: play.Game,
                    wins: 0,
                    game: play.game
                };
            }
            winsByGame[gameId].wins += 1;
        });

        const mostWonGames = Object.values(winsByGame)
            .sort((a, b) => b.wins - a.wins || a.gameName.localeCompare(b.gameName))
            .slice(0, 10);

        const highScoreByGame = {};
        state.plays.forEach(play => {
            const scores = Array.isArray(play.playerScores) ? play.playerScores : [];
            scores.forEach(score => {
                if (score.score === null || score.score === undefined || score.score === '') {
                    return;
                }
                const numericScore = parseFloat(score.score);
                if (!Number.isFinite(numericScore)) {
                    return;
                }
                const gameId = String(play.gameId || '');
                if (!(gameId in highScoreByGame) || numericScore > highScoreByGame[gameId]) {
                    highScoreByGame[gameId] = numericScore;
                }
            });
        });

        const playerRecordGamesMap = {};
        playerPlays.forEach(play => {
            const matchingScore = play.matchingScore;
            if (!matchingScore || matchingScore.score === null || matchingScore.score === undefined || matchingScore.score === '') {
                return;
            }

            const numericScore = parseFloat(matchingScore.score);
            const gameId = String(play.gameId || '');
            if (!Number.isFinite(numericScore) || !(gameId in highScoreByGame) || numericScore !== highScoreByGame[gameId]) {
                return;
            }

            if (!playerRecordGamesMap[gameId]) {
                playerRecordGamesMap[gameId] = {
                    gameId,
                    gameName: play.Game,
                    score: numericScore,
                    game: play.game,
                    lastAchievedOn: play.Date,
                    timesMatched: 0
                };
            }

            playerRecordGamesMap[gameId].timesMatched += 1;
            if (String(play.Date || '') > String(playerRecordGamesMap[gameId].lastAchievedOn || '')) {
                playerRecordGamesMap[gameId].lastAchievedOn = play.Date;
            }
        });

        const recordHighGames = Object.values(playerRecordGamesMap)
            .sort((a, b) => b.score - a.score || a.gameName.localeCompare(b.gameName));

        const recentPlays = sortedByDateDesc.slice(0, 15);

        return {
            player,
            playCount,
            firstPlay,
            lastPlay,
            mostWonGames,
            recordHighGames,
            recentPlays
        };
    }

    return {
        getInsightsViewModel,
        getRecentPlaysViewModel,
        getOnceUponViewModel,
        getNextplayViewModel,
        getLastRecordedPlayDate,
        getBggSchemaViewModel,
        getGameStatsViewModel,
        getPlayerStatsViewModel
    };
})();
