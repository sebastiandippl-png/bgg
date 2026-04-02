window.escapeHTMLUtil = function escapeHTMLUtil(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

window.isValidImageUrlUtil = function isValidImageUrlUtil(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        if (url.startsWith('data:')) return true;
        return urlObj.protocol === 'https:';
    } catch (_) {
        return false;
    }
};
