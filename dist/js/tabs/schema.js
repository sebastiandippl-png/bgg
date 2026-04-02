window.renderSchemaTab = function renderSchemaTab({ schemaData, escapeHTML, containerId = 'content-schema' }) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    function highlightJson(value) {
        const raw = JSON.stringify(value, null, 2);
        const tokenRegex = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g;
        let result = '';
        let lastIndex = 0;

        raw.replace(tokenRegex, (token, offset) => {
            result += escapeHTML(raw.slice(lastIndex, offset));

            let tokenClass = 'text-amber-300';
            if (/^"/.test(token)) {
                const trailing = raw.slice(offset + token.length);
                tokenClass = /^\s*:/.test(trailing) ? 'text-sky-300' : 'text-emerald-300';
            } else if (/^(true|false)$/.test(token)) {
                tokenClass = 'text-purple-300';
            } else if (/^null$/.test(token)) {
                tokenClass = 'text-gray-400';
            } else {
                tokenClass = 'text-orange-300';
            }

            result += `<span class="${tokenClass}">${escapeHTML(token)}</span>`;
            lastIndex = offset + token.length;
            return token;
        });

        result += escapeHTML(raw.slice(lastIndex));
        return result;
    }

    if (schemaData.message) {
        container.innerHTML = `<div class="text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded p-4">${escapeHTML(schemaData.message)}</div>`;
        return;
    }

    let html = '<h2 class="text-xl text-yellow-400 mb-2 font-bold">Synced Table Schemas</h2>';
    html += '<p class="text-sm text-gray-400 mb-4">Games schema now includes Thing stats fields: <span class="font-mono">weight</span>, <span class="font-mono">average_rating</span>, and <span class="font-mono">bgg_rating</span>.</p>';

    schemaData.tables.forEach(table => {
        html += '<section class="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden mb-6">';
        html += `<header class="px-4 py-3 border-b border-gray-700 bg-gray-800/70 flex items-center justify-between">`;
        html += `<h3 class="text-lg font-bold text-blue-400">${escapeHTML(table.tableName)}</h3>`;
        html += `<span class="text-xs text-gray-400">${escapeHTML(table.columns.length)} columns</span>`;
        html += '</header>';
        html += '<div class="divide-y divide-gray-800">';

        table.columns.forEach(col => {
            html += '<div class="px-4 py-3">';
            html += '<div class="flex flex-wrap items-center gap-2">';
            html += `<span class="font-mono text-sm text-gray-200">${escapeHTML(col.name)}</span>`;
            html += `<span class="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">${escapeHTML(col.type)}</span>`;
            if (col.primaryKey) {
                html += '<span class="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">PRIMARY KEY</span>';
            }
            if (col.notNull) {
                html += '<span class="text-[11px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">NOT NULL</span>';
            }
            if (col.defaultValue !== null) {
                html += `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-700/70 text-slate-200 border border-slate-600">DEFAULT ${escapeHTML(col.defaultValue)}</span>`;
            }
            html += '</div>';
            html += '</div>';
        });

        html += '</div></section>';
    });

    html += '<h2 class="text-xl text-yellow-400 mt-8 mb-2 font-bold">Example Owned Game JSON</h2>';
    html += '<p class="text-sm text-gray-400 mb-4">Sample is selected from <span class="font-mono">games.owned = 1</span>.</p>';
    html += '<section class="bg-gray-900 p-4 rounded border border-gray-700">';
    html += schemaData.sampleGameJson
        ? `<pre class="text-xs leading-5 bg-gray-950/80 border border-gray-700 rounded p-3 overflow-x-auto">${highlightJson(schemaData.sampleGameJson)}</pre>`
        : '<p class="text-sm text-gray-500">No owned game sample available.</p>';
    html += '</section>';

    html += '<h2 class="text-xl text-yellow-400 mt-8 mb-2 font-bold">Example Play JSON (Owned Game)</h2>';
    html += '<p class="text-sm text-gray-400 mb-4">Sample play is selected by joining plays to owned games.</p>';
    html += '<section class="bg-gray-900 p-4 rounded border border-gray-700">';
    html += schemaData.samplePlayJson
        ? `<pre class="text-xs leading-5 bg-gray-950/80 border border-gray-700 rounded p-3 overflow-x-auto">${highlightJson(schemaData.samplePlayJson)}</pre>`
        : '<p class="text-sm text-gray-500">No owned-play sample available.</p>';
    html += '</section>';

    container.innerHTML = html;
};
