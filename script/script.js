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

    function showPairingModal(ip, name) {
        const modal = document.getElementById('pairingModal');
        const msg = document.getElementById('pairingMessage');
        const ipInput = document.getElementById('pairingIp');
        const pinInput = document.getElementById('pairingPin');
        
        if (modal && msg && ipInput) {
            msg.textContent = `Voer de PIN code in die op ${name || ip} verschijnt:`;
            ipInput.value = ip;
            pinInput.value = '';
            modal.style.display = 'block';
            
            // Focus input
            setTimeout(() => pinInput.focus(), 100);
        }
    }

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
                    alert('Koppelen succesvol!');
                    pairingModal.style.display = 'none';
                } else {
                    alert('Koppelen mislukt: ' + (data.error || 'Onbekende fout'));
                }
            } catch (e) {
                alert('Netwerkfout bij koppelen');
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
            alert('Vul gebruikersnaam en wachtwoord in');
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
                
                if (data.hubInfo) {
                    localStorage.setItem('hubId', data.hubInfo.id);
                    localStorage.setItem('hubName', data.hubInfo.name);
                }

                window.location.href = '../pages/dashboard.html';
            } else {
                alert(data.message || 'Inloggen mislukt');
            }
        } catch (err) {
            console.error('Login request failed', err);
            alert('Kon geen verbinding maken met de server');
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
            { name: 'Dashboard', icon: 'fas fa-home', href: 'dashboard.html' },
            { name: 'Kamers', icon: 'fas fa-door-open', href: 'rooms.html' },
            { name: 'Apparaten', icon: 'fas fa-laptop-house', href: 'devices.html' },
            { name: 'Automatiseringen', icon: 'fas fa-magic', href: 'automations.html' },
            { name: 'Instellingen', icon: 'fas fa-cog', href: 'settings.html' }
        ];

        // Check for NAS (async)
        fetch('/api/nas')
            .then(res => res.json())
            .then(nasList => {
                if (nasList && nasList.length > 0) {
                    // Insert before Settings
                    menuItems.splice(3, 0, { name: 'Bestanden', icon: 'fas fa-folder-open', href: 'files.html' });
                }
                renderNav(menuItems, currentPage);
            })
            .catch(() => renderNav(menuItems, currentPage));
    }

    function renderNav(items, currentPage) {
        const nav = document.querySelector('.main-nav');
        if (!nav) return;

        let html = `
            <div class="nav-brand">
                <h1>DelovaHome</h1>
            </div>
            <ul>
        `;

        items.forEach(item => {
            const active = currentPage === item.href ? 'class="active"' : '';
            html += `<li><a href="${item.href}" ${active}><i class="${item.icon}"></i> ${item.name}</a></li>`;
        });

        html += `
                <li class="user-menu-container">
                    <span id="usernameDisplay"></span>
                    <div class="user-avatar"></div>
                    <div class="user-dropdown" id="userDropdown">
                        <a href="settings.html?tab=profile"><i class="fas fa-user"></i> Profiel</a>
                        <a href="#" class="logout"><i class="fas fa-sign-out-alt"></i> Uitloggen</a>
                    </div>
                </li>
            </ul>
        `;

        nav.innerHTML = html;
        
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

        // Update username
        const username = localStorage.getItem('username');
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay && username) {
            usernameDisplay.textContent = `Hallo, ${username}`;
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

    if (type === 'light' || type.includes('bulb') || type === 'hue') icon = 'fas fa-lightbulb';
    else if (type === 'switch' || type.includes('outlet') || type === 'shelly') icon = 'fas fa-plug';
    else if (type === 'tv' || type === 'television') {
        if (name.includes('apple') || name.includes('atv')) icon = 'fab fa-apple';
        else icon = 'fas fa-tv';
    }
    else if (type === 'speaker' || type === 'sonos') {
        if (name.includes('homepod')) icon = 'fab fa-apple';
        else if (name.includes('apple') || name.includes('atv')) icon = 'fab fa-apple';
        else if (name.includes('sonos') || type === 'sonos') icon = 'fas fa-music';
        else icon = 'fas fa-music';
    }
    else if (type === 'camera') icon = 'fas fa-video';
    else if (type === 'printer') icon = 'fas fa-print';
    else if (type === 'thermostat' || type === 'ac') icon = 'fas fa-thermometer-half';
    else if (type === 'lock') icon = 'fas fa-lock';
    else if (type === 'cover' || type === 'blind') icon = 'fas fa-warehouse';
    else if (type === 'vacuum') icon = 'fas fa-robot';
    else if (type === 'sensor') icon = 'fas fa-wifi';
    else if (type === 'console' || type === 'playstation') {
        if (name.includes('ps5') || name.includes('playstation')) icon = 'fab fa-playstation';
        else if (name.includes('xbox')) icon = 'fab fa-xbox';
        else icon = 'fas fa-gamepad';
    }
    else if (type === 'nas') icon = 'fas fa-server';
    else if (type === 'computer' || type === 'workstation' || type === 'pc' || type === 'mac') {
        if (type === 'mac' || name.includes('mac') || name.includes('apple')) icon = 'fab fa-apple';
        else if (name.includes('windows') || name.includes('pc')) icon = 'fab fa-windows';
        else if (name.includes('linux') || name.includes('ubuntu')) icon = 'fab fa-linux';
        else icon = 'fas fa-desktop';
    }
    else if (type === 'raspberrypi' || type === 'rpi') icon = 'fab fa-raspberry-pi';
    else if (type === 'esphome') icon = 'fas fa-microchip';
    else if (type === 'matter') icon = 'fas fa-atom';
    else if (type === 'homekit') icon = 'fab fa-apple';
    else if (type === 'smartthings') icon = 'fas fa-circle-nodes';
    else if (type === 'chromecast') icon = 'fab fa-chromecast';
    
    return icon;
}
