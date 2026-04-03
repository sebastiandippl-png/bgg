/**
 * auth-ui.js – Google Sign-In UI management for BGStats Dashboard
 *
 * On page load: checks auth_status, shows/hides admin-only elements.
 * Renders Google One Tap / Sign In button for non-admin users.
 * On login: sends id_token to google_login.php, reloads page on success.
 * Logout button POSTs to logout.php and reloads.
 */
(function () {
    'use strict';

    const ADMIN_ELEMENTS = [
        'admin-sync-bgg-btn',
        'admin-sync-games-btn',
        'admin-sync-metadata-btn',
        'admin-sync-plays-btn',
        'admin-sync-last-plays-btn',
        'tab-schema',
        'admin-logout-btn'
    ];
    const AUTH_STATUS_URL = 'api/auth_status.php';
    const LOGIN_URL       = 'api/google_login.php';
    const LOGOUT_URL      = 'api/logout.php';

    /** Show or hide the elements that are only visible to admins */
    function setAdminVisibility(isAdmin) {
        window.__bgstatsAdmin = isAdmin;

        ADMIN_ELEMENTS.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            if (isAdmin) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        // Show Google login shell only for non-admins
        var loginShell = document.getElementById('google-login-shell');
        if (loginShell) {
            loginShell.style.display = isAdmin ? 'none' : '';
        }
    }

    /** Called by Google Identity Services after a successful credential selection */
    window.handleGoogleCredential = function (response) {
        if (!response || !response.credential) return;

        fetch(LOGIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: response.credential }),
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.ok) {
                    window.location.reload();
                } else {
                    console.warn('BGStats login failed:', data && data.error);
                }
            })
            .catch(function (err) {
                console.error('BGStats login error:', err);
            });
    };

    /** Initialize: fetch auth status, configure UI */
    function init() {
        fetch(AUTH_STATUS_URL, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (res) { return res.json(); })
            .then(function (status) {
                setAdminVisibility(!!status.admin);

                if (!status.admin && status.clientId) {
                    // Render Google Sign-In button once GIS is loaded
                    var loginArea = document.getElementById('google-login-area');
                    if (!loginArea) return;

                    function renderGoogleButton() {
                        if (typeof google === 'undefined' || !google.accounts) return;
                        loginArea.innerHTML = '';
                        google.accounts.id.initialize({
                            client_id: status.clientId,
                            callback: window.handleGoogleCredential,
                        });
                        google.accounts.id.renderButton(loginArea, {
                            theme: 'outline',
                            size: 'large',
                            text: 'signin_with',
                            shape: 'rectangular',
                        });
                    }

                    // GIS script may not be loaded yet (async defer)
                    if (typeof google !== 'undefined' && google.accounts) {
                        renderGoogleButton();
                    } else {
                        window.addEventListener('load', renderGoogleButton);
                    }
                }
            })
            .catch(function (err) {
                // API unavailable (e.g. local file:// mode) – hide admin elements
                setAdminVisibility(false);
                console.info('BGStats auth status unavailable:', err);
            });

        // Logout button
        var logoutBtn = document.getElementById('admin-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () {
                fetch(LOGOUT_URL, { method: 'POST', credentials: 'same-origin' })
                    .then(function () { window.location.reload(); })
                    .catch(function () { window.location.reload(); });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
