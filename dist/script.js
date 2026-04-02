if (window.BGStatsDashboard && typeof window.BGStatsDashboard.init === 'function') {
    window.BGStatsDashboard.init().catch(error => {
        console.error('Dashboard init failed:', error);
        alert('Fehler bei der Initialisierung des Dashboards.');
    });
}
