document.addEventListener('DOMContentLoaded', () => {
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

    // --- WebSocket for Pairing ---
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pairing-required') {
                showPairingModal(msg.ip, msg.name);
            }
        } catch (e) {
            console.error('WS Error:', e);
        }
    };

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

    // Check for NAS and add "Bestanden" tab if configured
    const navUl = document.querySelector('.main-nav ul');
    if (navUl) {
        fetch('/api/nas')
            .then(res => res.json())
            .then(nasList => {
                if (nasList && nasList.length > 0) {
                    // Check if already exists to avoid duplicates
                    if (!navUl.innerHTML.includes('Bestanden')) {
                        const li = document.createElement('li');
                        // Determine if we are on files.html to set active class
                        const isActive = window.location.pathname.includes('files.html') ? 'class="active"' : '';
                        li.innerHTML = `<a href="files.html" ${isActive}><i class="fas fa-folder-open"></i> Bestanden</a>`;
                        
                        // Insert before "Instellingen" if possible
                        const settingsLi = Array.from(navUl.children).find(child => child.textContent.includes('Instellingen'));
                        if (settingsLi) {
                            navUl.insertBefore(li, settingsLi);
                        } else {
                            // Otherwise just append before the user menu (last item)
                            const userMenu = navUl.querySelector('.user-menu-container');
                            if (userMenu) {
                                navUl.insertBefore(li, userMenu);
                            } else {
                                navUl.appendChild(li);
                            }
                        }
                    }
                }
            })
            .catch(err => console.log('Error checking NAS status:', err));
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
});