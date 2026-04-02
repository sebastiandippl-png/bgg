window.sortDataUtil = function sortDataUtil(data, sortConfig) {
    return [...data].sort((a, b) => {
        let valA = a[sortConfig.col];
        let valB = b[sortConfig.col];

        if (valA === null || valA === undefined || valA === '-') valA = '';
        if (valB === null || valB === undefined || valB === '-') valB = '';

        const isNumA = typeof valA === 'number' || (valA !== '' && !isNaN(Number(valA)));
        const isNumB = typeof valB === 'number' || (valB !== '' && !isNaN(Number(valB)));

        if (isNumA && isNumB) {
            return sortConfig.asc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
        }

        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        if (valA < valB) return sortConfig.asc ? -1 : 1;
        if (valA > valB) return sortConfig.asc ? 1 : -1;
        return 0;
    });
};
