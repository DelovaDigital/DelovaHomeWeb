/* Global Auth Interceptor */
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
        const token = localStorage.getItem('token');
        if (token) {
            if (!options.headers) options.headers = {};
            if (options.headers instanceof Headers) {
                options.headers.append('Authorization', `Bearer ${token}`);
            } else {
                if (!options.headers['Authorization']) {
                     options.headers['Authorization'] = `Bearer ${token}`;
                }
            }
        }
    }
    return originalFetch(url, options);
};

document.addEventListener('DOMContentLoaded', () => {
    // Clear anti-FOUC inline styles so CSS gradients can take over
    document.documentElement.style.background = '';
    document.documentElement.style.color = '';
    if (document.body) document.body.style.background = '';

    // --- Auth Guard ---
    // Check if we are on a protected page (anything inside /pages/)
    if (window.location.pathname.includes('/pages/')) {
        const userId = localStorage.getItem('userId');
        
        if (!userId) {
            // Not logged in, redirect to login page
            window.location.href = '../index.html';
            return; // Stop execution
        }
    }

    const avatar = document.querySelector('.user-avatar');
    const dropdown = document.getElementById('userDropdown');
    const btnLogin = document.getElementById('btnLogin');
    const themeStylesheet = document.getElementById('theme-stylesheet');
    const btnCreateAccount = document.getElementById('btnCreateAccount');
 
    // Check if we are on the login page and if setup is needed
    if (document.getElementById('btnLogin')) {
        fetch('/api/setup/status')
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    if (!data.setupNeeded) {
                        // Users exist, hide "Create Account" button
                        if (btnCreateAccount) btnCreateAccount.style.display = 'none';
                    } else {
                        // No users, show "Create Account" button
                        if (btnCreateAccount) btnCreateAccount.style.display = 'block';
                    }
                }
            })
            .catch(e => console.error('Failed to check setup status:', e));
    }
    
    if (btnCreateAccount) {
        btnCreateAccount.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '../pages/register.html';
        });
    }

    if (themeStylesheet) {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            themeStylesheet.href = '../style/style-dark.css';
        }
    }
        // Theme toggle control (if present on settings page)
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (themeStylesheet) {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                if (darkModeToggle) darkModeToggle.checked = true;
            } else {
                if (darkModeToggle) darkModeToggle.checked = false;
            }

            if (darkModeToggle) {
                darkModeToggle.addEventListener('change', () => {
                    if (darkModeToggle.checked) {
                        themeStylesheet.href = '../style/style-dark.css';
                        localStorage.setItem('theme', 'dark');
                    } else {
                        themeStylesheet.href = '../style/style.css';
                        localStorage.setItem('theme', 'light');
                    }
                });
            }
        }

    const username = localStorage.getItem('username');
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay && username) {
        usernameDisplay.textContent = `Hallo, ${username}`;
    }

    // Helper to update greeting using i18n when translations become available
    function updateGreeting() {
        const uname = localStorage.getItem('username');
        if (!uname) return;
        const els = document.querySelectorAll('#usernameDisplay');
        let template = (window.t && typeof window.t === 'function') ? window.t('greeting') : null;
        // Avoid using prettified key "Greeting" if translation not loaded
        if (template && !template.includes('{name}')) template = null;
        
        const text = template ? template.replace('{name}', uname) : `Hallo, ${uname}`;
        els.forEach(el => { if (el) el.textContent = text; });
    }

    // Ensure greeting updates when translations load or are applied
    document.addEventListener('translationsLoaded', updateGreeting);
    document.addEventListener('translations-applied', updateGreeting);

    // Display Hub Name if available (e.g. in header or title)
    let hubName = localStorage.getItem('hubName');
    const brandHeader = document.querySelector('.nav-brand h1');
    
    // If we are logged in but don't have hub info, fetch it
    if (!hubName && localStorage.getItem('userId')) {
         fetch('/api/system/info')
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    localStorage.setItem('hubId', data.hubId);
                    localStorage.setItem('hubName', data.name);
                    if (brandHeader) brandHeader.textContent = data.name;
                }
            })
            .catch(err => console.error('Failed to fetch hub info', err));
    } else if (brandHeader && hubName) {
        brandHeader.textContent = hubName;
    }

    const logoutLink = document.querySelector('.logout');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('username');
            localStorage.removeItem('userId');
            window.location.href = '../index.html';
        });
    }

    const closeDropdown = () => {
        if (dropdown) dropdown.classList.remove('show');
    };

    const toggleDropdown = (e) => {
        if (!dropdown) return;
        e.stopPropagation();
        dropdown.classList.toggle('show');
    };

    if (avatar) {
        avatar.addEventListener('click', toggleDropdown);
    }
    
    document.addEventListener('click', closeDropdown);

    // function showPairingModal(ip, name) {
    //     const modal = document.getElementById('pairingModal');
    //     const msg = document.getElementById('pairingMessage');
    //     const ipInput = document.getElementById('pairingIp');
    //     const pinInput = document.getElementById('pairingPin');
        
    //     if (modal && msg && ipInput) {
    //         msg.textContent = `Voer de PIN code in die op ${name || ip} verschijnt:`;
    //         ipInput.value = ip;
    //         pinInput.value = '';
    //         modal.style.display = 'block';
            
    //         // Focus input
    //         if (pinInput) pinInput.focus();
    //     }
    // }

    // Pairing Modal Logic
    const pairingModal = document.getElementById('pairingModal');
    if (pairingModal) {
        const closeBtn = pairingModal.querySelector('.close-modal');
        const submitBtn = document.getElementById('submitPairing');
        const pinInput = document.getElementById('pairingPin');
        const ipInput = document.getElementById('pairingIp');

        closeBtn.onclick = () => pairingModal.style.display = 'none';
        
        submitBtn.onclick = async () => {
            const pin = pinInput.value;
            const ip = ipInput.value;
            if (!pin) return;

            try {
                const res = await fetch('/api/device/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, pin })
                });
                const data = await res.json();
                if (data.success) {
                    alert(window.t ? window.t('pairing_successful') : 'Koppelen succesvol!');
                    pairingModal.style.display = 'none';
                } else {
                    alert((window.t ? window.t('pairing_failed') : 'Koppelen mislukt: ') + (data.error || (window.t ? window.t('unknown_error') : 'Onbekende fout')));
                }
            } catch (e) {
                alert(window.t ? window.t('network_error_pairing') : 'Netwerkfout bij koppelen');
            }
        };
    }

    if (avatar) avatar.addEventListener('click', toggleDropdown);
    if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

    if (btnLogin) btnLogin.addEventListener('click', login);
    async function login(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!username || !password) {
            alert(window.t ? window.t('enter_username_password') : 'Vul gebruikersnaam en wachtwoord in');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                // Login succeeded - save user data to localStorage
                localStorage.setItem('username', data.username);
                localStorage.setItem('userId', data.userId);
                
                // Check for multiple hubs (Cloud Login)
                if (data.hubs && data.hubs.length > 1) {
                    const form = document.querySelector('.auth-form');
                    if (form) {
                        form.innerHTML = '<h3 style="margin-bottom:15px;">Select Hub</h3><div class="hub-list" style="display:flex;flex-direction:column;gap:10px;"></div>';
                        const list = form.querySelector('.hub-list');
                        
                        data.hubs.forEach(hub => {
                            const btn = document.createElement('button');
                            btn.className = 'buttonLogin'; // Reuse existing class
                            btn.textContent = hub.name;
                            btn.style.width = '100%';
                            btn.style.padding = '12px';
                            btn.style.cursor = 'pointer';
                            btn.onclick = async (ev) => {
                                ev.preventDefault();
                                try {
                                    // Call select-hub API
                                    await fetch('/api/auth/select-hub', {
                                        method: 'POST',
                                        headers: { 
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${data.token}`
                                        },
                                        body: JSON.stringify({ hubId: hub.id })
                                    });
                                    
                                    localStorage.setItem('hubId', hub.id);
                                    localStorage.setItem('hubName', hub.name);
                                    window.location.href = '../pages/dashboard.html';
                                } catch (err) {
                                    console.error('Failed to select hub', err);
                                    alert(window.t ? window.t('failed_select_hub') : 'Failed to select hub');
                                }
                            };
                            list.appendChild(btn);
                        });
                        return; // Stop auto-redirect
                    }
                }

                if (data.hubInfo) {
                    localStorage.setItem('hubId', data.hubInfo.id);
                    localStorage.setItem('hubName', data.hubInfo.name);
                }

                // Save Auth
                if (data.token) localStorage.setItem('token', data.token);
                if (data.role) localStorage.setItem('userRole', data.role);
                if (data.userId) localStorage.setItem('userId', data.userId);

                window.location.href = '../pages/dashboard.html';
            } else {
                alert(data.message || (window.t ? window.t('login_failed') : 'Inloggen mislukt'));
            }
        } catch (err) {
            console.error('Login request failed', err);
            alert(window.t ? window.t('server_unreachable') : 'Kon geen verbinding maken met de server');
        }
    }

    // --- Hub Info Loader (Settings Page) ---
    const hubIdEl = document.getElementById('hubId');
    if (hubIdEl) {
        fetch('/api/system/info')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (data.ok) {
                    document.getElementById('hubName').textContent = data.name;
                    document.getElementById('hubId').textContent = data.hubId;
                    document.getElementById('hubVersion').textContent = data.version;
                } else {
                    document.getElementById('hubName').textContent = 'Fout: ' + (data.message || 'Onbekend');
                }
            })
            .catch(err => {
                console.error('Failed to load hub info', err);
                document.getElementById('hubName').textContent = 'Verbindingsfout: ' + err.message;
            });
    }

    // --- Navigation Rendering ---
    const navContainer = document.querySelector('.main-nav');
    if (navContainer) {
        const currentPage = window.location.pathname.split('/').pop();
        const menuItems = [
            { key: 'dashboard', name: 'Dashboard', icon: 'fas fa-home', href: 'dashboard.html' },
            { key: 'rooms', name: 'Kamers', icon: 'fas fa-door-open', href: 'rooms.html' },
            { key: 'devices', name: 'Apparaten', icon: 'fas fa-laptop-house', href: 'devices.html' },
            { key: 'floorplan', name: 'Floorplan', icon: 'fas fa-map-marked-alt', href: 'floorplan.html' },
            { key: 'energy', name: 'Energy', icon: 'fas fa-bolt', href: 'energy.html' },
            { key: 'automations', name: 'Automatiseringen', icon: 'fas fa-magic', href: 'automations.html' },
            { key: 'settings', name: 'Instellingen', icon: 'fas fa-cog', href: 'settings.html' }
        ];

        // Immediate render to prevent flickering/missing nav
        renderNav(menuItems, currentPage);

        // Check for NAS (async) and re-render if needed
        fetch('/api/nas')
            .then(res => res.json())
            .then(nasList => {
                if (nasList && nasList.length > 0) {
                    // Avoid duplicate insertion
                    if (!menuItems.find(i => i.key === 'files')) {
                         // Insert before Settings
                        menuItems.splice(6, 0, { key: 'files', name: 'Bestanden', icon: 'fas fa-folder-open', href: 'files.html' });
                        renderNav(menuItems, currentPage);
                    }
                }
            })
            .catch(() => { /* No NAS or error, keep default nav */ });

        // Re-render navigation when translations have been loaded/applied
        document.addEventListener('translationsLoaded', () => {
            renderNav(menuItems, window.location.pathname.split('/').pop());
        });
        document.addEventListener('translations-applied', () => {
            renderNav(menuItems, window.location.pathname.split('/').pop());
        });
    }

    // Helper to prettify keys if i18n missing
    function prettifyKey(key) {
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }

    function renderNav(items, currentPage) {
        const nav = document.querySelector('.main-nav');
        if (!nav) return;

        let html = `
            <div class="nav-brand">
                <h1 data-i18n="brand_name">DelovaHome</h1>
            </div>
            <ul>
        `;

        items.forEach(item => {
            // Prefetch other pages to speed up navigation network requests
            if (item.href && item.href !== currentPage && !document.querySelector(`link[rel="prefetch"][href="${item.href}"]`)) {
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = item.href;
                document.head.appendChild(link);
            }

            const active = currentPage === item.href ? 'class="active"' : '';
                const label = (window.t && item.key) ? window.t(item.key) : (item.name || item.key || '');
                // Render with data-i18n so i18n.applyTranslations can update labels directly
                if (item.key) {
                    html += `<li><a href="${item.href}" ${active}><i class="${item.icon}"></i> <span data-i18n="${item.key}">${label}</span></a></li>`;
                } else {
                    html += `<li><a href="${item.href}" ${active}><i class="${item.icon}"></i> ${label}</a></li>`;
                }
        });

        html += `
                <li class="user-menu-container">
                    <span id="usernameDisplay"></span>
                    <div class="user-avatar"></div>
                    <div class="user-dropdown" id="userDropdown">
                            <a href="settings.html?tab=profile"><i class="fas fa-user"></i> <span data-i18n="profile">${window.t ? window.t('profile') : prettifyKey('profile')}</span></a>
                            <a href="#" class="logout"><i class="fas fa-sign-out-alt"></i> <span data-i18n="logout">${window.t ? window.t('logout') : prettifyKey('logout')}</span></a>
                    </div>
                </li>
            </ul>
        `;

        // Prevent unnecessary DOM trashing/respringing
        if (nav.lastRenderedHTML === html) return;
        
        nav.innerHTML = html;
        nav.lastRenderedHTML = html;

        // If translations are available or just loaded, apply them to newly-inserted nav
        if (window.applyTranslations) {
            try { window.applyTranslations(); } catch (e) { /* ignore */ }
        }

        // Update greeting text in nav after translations applied
        try { if (typeof updateGreeting === 'function') updateGreeting(); } catch (e) { /* ignore */ }
        
        // Re-initialize dynamic elements
        const avatar = nav.querySelector('.user-avatar');
        const dropdown = nav.querySelector('#userDropdown');
        const logoutLink = nav.querySelector('.logout');
        
        if (avatar && dropdown) {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });
            dropdown.addEventListener('click', (e) => e.stopPropagation());
        }
        
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('username');
                localStorage.removeItem('userId');
                window.location.href = '../index.html';
            });
        }

        // Update username and Avatar
        const username = localStorage.getItem('username');
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay && username) {
            let greetTemplate = (window.t && typeof window.t === 'function') ? window.t('greeting') : null;
            // Avoid using prettified key "Greeting" if translation not loaded
            if (greetTemplate && !greetTemplate.includes('{name}')) greetTemplate = null;

            usernameDisplay.textContent = greetTemplate ? greetTemplate.replace('{name}', username) : `Hallo, ${username}`;
            
            // Set dynamic avatar with initials & color
            const avatarEl = nav.querySelector('.user-avatar');
            if (avatarEl) {
                // Generate color from name
                let hash = 0;
                for (let i = 0; i < username.length; i++) {
                    hash = username.charCodeAt(i) + ((hash << 5) - hash);
                }
                const color = Math.floor(Math.abs((Math.sin(hash) * 16777215)) % 16777215).toString(16).padStart(6, '0');
                
                avatarEl.style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${color}&color=fff&bold=true')`;
            }
        }
        
        // Update Hub Name
        let hubName = localStorage.getItem('hubName');
        const brandHeader = nav.querySelector('.nav-brand h1');
        if (brandHeader && hubName) {
            brandHeader.textContent = hubName;
        }
    }

    // WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws;

    function connectWebSocket() {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'device-update') {
                    // Dispatch event for other scripts
                    const customEvent = new CustomEvent('device-update', { detail: msg.device });
                    document.dispatchEvent(customEvent);
                } else if (msg.type === 'energy-update') {
                    const customEvent = new CustomEvent('energy-update', { detail: msg.data });
                    document.dispatchEvent(customEvent);
                } else if (msg.type === 'pairing-required') {
                    showPairingModal(msg.ip, msg.name);
                } else if (msg.type === 'notification') {
                    const customEvent = new CustomEvent('notification', { detail: msg.data });
                    document.dispatchEvent(customEvent);
                    
                    // Show basic toaster
                    const div = document.createElement('div');
                    const level = msg.data.level || 'info';
                    div.className = `unified-toast ${level}`;
                    
                    let icon = 'fa-info-circle';
                    let borderColor = '#3b82f6';
                    if (level === 'error') { icon = 'fa-exclamation-circle'; borderColor = '#ef4444'; }
                    else if (level === 'warning') { icon = 'fa-exclamation-triangle'; borderColor = '#f59e0b'; }
                    else if (level === 'success') { icon = 'fa-check-circle'; borderColor = '#10b981'; }
                    
                    div.innerHTML = `
                        <div style="display:flex; align-items:flex-start; gap:10px;">
                            <i class="fas ${icon}" style="margin-top:3px; color:${borderColor}"></i>
                            <div>
                                <div style="font-weight:bold; margin-bottom:2px;">${msg.data.title || 'Notification'}</div>
                                <div style="font-size:0.9em; opacity:0.9;">${msg.data.message}</div>
                            </div>
                        </div>
                    `;
                    
                    div.style.cssText = `
                        position: fixed; 
                        bottom: 20px; 
                        right: 20px; 
                        background: rgba(30, 41, 59, 0.9); 
                        color: white; 
                        padding: 15px; 
                        border-radius: 8px; 
                        z-index: 9999; 
                        animation: slideInRight 0.3s forwards; 
                        box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
                        backdrop-filter: blur(10px); 
                        border-left: 4px solid ${borderColor};
                        min-width: 300px;
                        max-width: 400px;
                    `;
                    
                    // Add keyframes if not exists
                    if (!document.getElementById('toast-style')) {
                        const style = document.createElement('style');
                        style.id = 'toast-style';
                        style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
                        document.head.appendChild(style);
                    }
                    
                    document.body.appendChild(div);
                    setTimeout(() => { 
                        div.style.transition = 'all 0.3s ease';
                        div.style.opacity = '0'; 
                        div.style.transform = 'translateX(20px)';
                        setTimeout(() => div.remove(), 300); 
                    }, 5000);
                }
            } catch (e) {
                console.error('Error parsing WebSocket message', e);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected. Reconnecting in 3s...');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            ws.close();
        };
    }

    // Start connection if we are logged in
    if (localStorage.getItem('userId')) {
        connectWebSocket();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('Tab became visible, checking connection...');
            if (localStorage.getItem('userId')) {
                 if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    console.log('WebSocket closed, reconnecting...');
                    connectWebSocket();
                }
            }
        }
    });
});
// Global helper to determine device icon
function getDeviceIconClass(device) {
    let icon = 'fas fa-question-circle';
    const type = device.type ? device.type.toLowerCase() : 'unknown';
    const name = device.name ? device.name.toLowerCase() : '';
    const model = device.model ? device.model.toLowerCase() : '';

    if (type === 'light' || type.includes('bulb') || type === 'hue') icon = 'fas fa-lightbulb';
    else if (type === 'switch' || type.includes('outlet') || type === 'shelly') icon = 'fas fa-plug';
    else if (type === 'tv' || type === 'television') {
        if (name.includes('apple') || name.includes('atv') || model.includes('apple') || model.includes('tv')) icon = 'fab fa-apple';
        else icon = 'fas fa-tv';
    }
    else if (type === 'speaker' || type === 'sonos') {
        if (name.includes('homepod') || model.includes('homepod')) icon = 'fab fa-apple';
        else if (name.includes('apple') || name.includes('atv') || name.includes('mac') || model.includes('apple') || model.includes('mac')) icon = 'fab fa-apple';
        else if (name.includes('sonos') || type === 'sonos' || model.includes('sonos')) icon = 'fas fa-music';
        else icon = 'fas fa-music';
    }
    else if (type === 'camera') icon = 'fas fa-video';
    else if (type === 'printer') icon = 'fas fa-print';
    else if (type === 'thermostat' || type === 'ac') icon = 'fas fa-thermometer-half';
    else if (type === 'lock') icon = 'fas fa-lock';
    else if (type === 'cover' || type === 'blind') icon = 'fas fa-warehouse';
    else if (type === 'vacuum') icon = 'fas fa-robot';
    else if (type === 'sensor') icon = 'fas fa-wifi';
    else if (type === 'console' || type === 'playstation' || type === 'ps5' || type === 'xbox') {
        if (name.includes('ps5') || name.includes('playstation') || type === 'ps5' || model.includes('ps5')) icon = 'fab fa-playstation';
        else if (name.includes('xbox') || type === 'xbox' || model.includes('xbox')) icon = 'fab fa-xbox';
        else icon = 'fas fa-gamepad';
    }
    else if (type === 'nas') icon = 'fas fa-server';
    else if (type === 'computer' || type === 'workstation' || type === 'pc' || type === 'mac') {
        if (type === 'mac' || name.includes('mac') || name.includes('apple') || model.includes('mac') || model.includes('apple')) icon = 'fab fa-apple';
        else if (name.includes('windows') || name.includes('pc') || model.includes('windows')) icon = 'fab fa-windows';
        else if (name.includes('linux') || name.includes('ubuntu') || model.includes('linux')) icon = 'fab fa-linux';
        else icon = 'fas fa-desktop';
    }
    else if (type === 'raspberrypi' || type === 'rpi') icon = 'fab fa-raspberry-pi';
    else if (type === 'esphome') icon = 'fas fa-microchip';
    else if (type === 'matter') icon = 'fas fa-atom';
    else if (type === 'homekit') icon = 'fab fa-apple';
    else if (type === 'smartthings') icon = 'fas fa-circle-nodes';
    else if (type === 'chromecast') icon = 'fab fa-chromecast';
    
    // Appliances
    else if (type === 'washer' || name.includes('washer') || name.includes('washing')) icon = 'fas fa-tshirt';
    else if (type === 'dryer' || name.includes('dryer')) icon = 'fas fa-wind';
    else if (type === 'fridge' || type === 'refrigerator' || name.includes('fridge')) icon = 'fas fa-snowflake';
    else if (type === 'dishwasher') icon = 'fas fa-utensils';
    else if (type === 'oven' || type === 'stove') icon = 'fas fa-fire';
    else if (type === 'coffee' || type === 'coffee_machine') icon = 'fas fa-coffee';
    else if (type === 'fan' || type === 'bond') icon = 'fas fa-fan';
    
    return icon;
}
