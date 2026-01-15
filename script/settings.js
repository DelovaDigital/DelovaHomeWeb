document.addEventListener('DOMContentLoaded', () => {
    // RBAC: Check Role & Hide Admin Elements
    const role = localStorage.getItem('userRole');
    if (role !== 'Admin' && role !== 'admin') {
        const restricted = ['users', 'knx', 'developer'];
        restricted.forEach(target => {
            const item = document.querySelector(`.settings-nav-item[data-target="${target}"]`);
            if (item) item.style.display = 'none';
        });
        
        // Guard against manual URL navigation
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab');
        if (restricted.includes(tab)) {
             // Defer slightly to ensure tab logic runs
             setTimeout(() => {
                 const general = document.querySelector('.settings-nav-item[data-target="general"]');
                 if(general) general.click();
             }, 100);
        }
    }

    // --- Tab Switching Logic ---
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    function switchTab(targetId) {
        // Remove active class from all items
        navItems.forEach(nav => {
            if (nav.getAttribute('data-target') === targetId) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });

        // Hide all sections
        sections.forEach(section => section.classList.remove('active'));
        
        // Show target section
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.classList.add('active');
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            switchTab(targetId);
        });
    });

    // Check URL params for initial tab
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
        switchTab(tabParam);
    }

    // --- Profile Settings ---
    const profileUsername = document.getElementById('profileUsername');
    if (profileUsername) {
        profileUsername.textContent = localStorage.getItem('username') || 'User';
    }

    const changePassForm = document.getElementById('change-password-form');
    if (changePassForm) {
        changePassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPass = document.getElementById('current-pass').value;
            const newPass = document.getElementById('new-pass').value;
            const confirmPass = document.getElementById('confirm-pass').value;
            const btn = changePassForm.querySelector('button');

            if (newPass !== confirmPass) {
                alert(window.t ? window.t('password_mismatch') : 'Passwords do not match');
                return;
            }

            const originalText = btn.textContent;
            btn.textContent = window.t ? window.t('loading') : 'Loading...';
            btn.disabled = true;

            try {
                // Mock API call - replace with real endpoint
                // const res = await fetch('/api/user/password', { ... });
                await new Promise(r => setTimeout(r, 1000)); // Simulate delay
                
                alert(window.t ? window.t('password_changed') : 'Password changed');
                changePassForm.reset();
            } catch (err) {
                alert(window.t ? window.t('error') : 'Error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // --- Language Settings ---
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        const currentLang = localStorage.getItem('language') || 'nl';
        languageSelect.value = currentLang;

        languageSelect.addEventListener('change', () => {
            const newLang = languageSelect.value;
            localStorage.setItem('language', newLang);
            if (window.applyTranslations) {
                window.applyTranslations();
            } else {
                window.location.reload();
            }
        });
    }

    // --- Hub Settings (Timezone & Features) ---
    fetchHubSettings();

    function setupFeatureToggle(id, featureKey) {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.addEventListener('change', async () => {
                const enabled = toggle.checked;
                try {
                    await fetch('/api/settings/features', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ feature: featureKey, enabled })
                    });
                } catch (e) {
                     console.error(`Failed to toggle ${featureKey}`, e);
                     toggle.checked = !enabled; // Revert on error
                }
            });
        }
    }

    setupFeatureToggle('featureAdaptiveLighting', 'adaptiveLighting');
    setupFeatureToggle('featureClimate', 'climateControl');
    setupFeatureToggle('featureEnergy', 'energySaver');
    setupFeatureToggle('featureSecurity', 'securitySystem');

    // --- Energy Settings ---
    const energyForm = document.getElementById('energy-form');
    const solarCapacityInput = document.getElementById('solar-capacity');
    const gridLimitInput = document.getElementById('grid-limit');
    const costKwhInput = document.getElementById('cost-kwh');
    const btnSaveEnergy = document.getElementById('btn-save-energy');

    // Load Energy Config
    fetch('/api/energy/config')
        .then(res => res.json())
        .then(config => {
            if (config) {
                solarCapacityInput.value = config.solarCapacity || '';
                gridLimitInput.value = config.gridLimit || '';
                costKwhInput.value = config.costPerKwh || '';
            }
        })
        .catch(err => console.error('Failed to load energy config:', err));

    // Save Energy Config
    if (btnSaveEnergy) {
        btnSaveEnergy.addEventListener('click', async () => {
            const originalText = btnSaveEnergy.textContent;
            btnSaveEnergy.textContent = 'Opslaan...';
            btnSaveEnergy.disabled = true;

            const config = {
                solarCapacity: parseFloat(solarCapacityInput.value),
                gridLimit: parseFloat(gridLimitInput.value),
                costPerKwh: parseFloat(costKwhInput.value)
            };

            try {
                const res = await fetch('/api/energy/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                if (res.ok) {
                    btnSaveEnergy.textContent = 'Opgeslagen!';
                    setTimeout(() => {
                        btnSaveEnergy.textContent = originalText;
                        btnSaveEnergy.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (err) {
                console.error(err);
                btnSaveEnergy.textContent = 'Fout!';
                setTimeout(() => {
                    btnSaveEnergy.textContent = originalText;
                    btnSaveEnergy.disabled = false;
                }, 2000);
            }
        });
    }

    // --- KNX Settings ---
    const knxForm = document.getElementById('knx-form');
    const knxIpInput = document.getElementById('knx-ip');
    const knxPortInput = document.getElementById('knx-port');
    const knxPhysInput = document.getElementById('knx-phys');
    const btnSaveKnx = document.getElementById('btn-save-knx');

    // Load KNX Config
    fetch('/api/knx/config')
        .then(res => res.json())
        .then(config => {
            if (config) {
                knxIpInput.value = config.ipAddr || '';
                knxPortInput.value = config.ipPort || 3671;
                knxPhysInput.value = config.physAddr || '1.1.128';
            }
        })
        .catch(err => console.error('Failed to load KNX config:', err));

    // Save KNX Config
    if (btnSaveKnx) {
        btnSaveKnx.addEventListener('click', async () => {
            const originalText = btnSaveKnx.textContent;
            btnSaveKnx.textContent = 'Verbinden...';
            btnSaveKnx.disabled = true;

            const config = {
                ipAddr: knxIpInput.value,
                ipPort: parseInt(knxPortInput.value),
                physAddr: knxPhysInput.value
            };

            try {
                const res = await fetch('/api/knx/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                if (res.ok) {
                    btnSaveKnx.textContent = 'Verbonden!';
                    setTimeout(() => {
                        btnSaveKnx.textContent = originalText;
                        btnSaveKnx.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (err) {
                console.error(err);
                btnSaveKnx.textContent = 'Fout!';
                setTimeout(() => {
                    btnSaveKnx.textContent = originalText;
                    btnSaveKnx.disabled = false;
                }, 2000);
            }
        });
    }

    // --- Spotify Settings ---
    const spotifyStatusIndicator = document.getElementById('spotify-status-indicator');
    const spotifyStatusText = document.getElementById('spotify-status-text');
    const btnSpotifyAction = document.getElementById('btn-spotify-action');
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');

    if (btnSpotifyAction && (userId || username)) {
        async function checkSpotifyStatus() {
            try {
                let query = '';
                // If we are on Cloud, we might have a UUID userId but we need to check status using username
                // because the backend resolves it.
                if (username) {
                    query = `username=${username}`;
                } else if (userId) {
                    query = `userId=${userId}`;
                }

                const res = await fetch(`/api/spotify/me?${query}`);
                const data = await res.json();
                
                if (data.available) {
                    spotifyStatusIndicator.style.backgroundColor = '#1DB954'; // Spotify Green
                    spotifyStatusText.textContent = window.t ? window.t('connected') : 'Verbonden';
                    btnSpotifyAction.textContent = window.t ? window.t('disconnect') : 'Ontkoppelen';
                    btnSpotifyAction.classList.replace('btn-primary', 'btn-danger');
                    btnSpotifyAction.onclick = disconnectSpotify;
                } else {
                    spotifyStatusIndicator.style.backgroundColor = '#ccc';
                    spotifyStatusText.textContent = window.t ? window.t('not_connected') : 'Niet verbonden';
                    btnSpotifyAction.textContent = window.t ? window.t('connect') : 'Verbinden';
                    btnSpotifyAction.classList.replace('btn-danger', 'btn-primary');
                    btnSpotifyAction.onclick = connectSpotify;
                }
            } catch (e) {
                console.error('Error checking Spotify status:', e);
            }
        }

        function connectSpotify() {
            let params = new URLSearchParams();
            if (userId) params.append('userId', userId);
            if (username) params.append('username', username);
            window.location.href = `/api/spotify/login?${params.toString()}`;
        }

        async function disconnectSpotify() {
            if (!confirm(window.t ? window.t('confirm_disconnect') : 'Weet je zeker dat je Spotify wilt ontkoppelen?')) return;
            
            try {
                const res = await fetch('/api/spotify/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, username })
                });
                
                if (res.ok) {
                    checkSpotifyStatus();
                } else {
                    alert('Fout bij ontkoppelen');
                }
            } catch (e) {
                console.error(e);
                alert('Netwerkfout');
            }
        }

        // Check status on load
        checkSpotifyStatus();
    }

    // --- Cloud Settings Logic ---
    async function checkCloudStatus() {
        try {
            const res = await fetch('/api/cloud/status');
            const data = await res.json();
            
            if (data.connected) {
                document.getElementById('cloud-status-container').style.display = 'block';
                document.getElementById('cloud-status-text').textContent = 'Connected to ' + (data.cloudUrl || 'Cloud');
                document.getElementById('cloud-hub-id').textContent = 'Hub ID: ' + data.hubId;
                document.getElementById('cloud-form').style.display = 'none';
            } else {
                document.getElementById('cloud-status-container').style.display = 'none';
                document.getElementById('cloud-form').style.display = 'block';
            }
        } catch (e) {
            console.error('Failed to check cloud status:', e);
        }
    }

    // Check on load
    checkCloudStatus();

    window.toggleCloudSettingsTab = (tab) => {
        const loginBtn = document.getElementById('tab-cloud-login');
        const regBtn = document.getElementById('tab-cloud-register');
        const emailGroup = document.getElementById('cloud-email-group');
        
        if (tab === 'login') {
            loginBtn.classList.add('active');
            loginBtn.style.background = 'var(--primary)';
            loginBtn.style.color = 'white';
            regBtn.classList.remove('active');
            regBtn.style.background = '';
            regBtn.style.color = '';
            emailGroup.style.display = 'none';
        } else {
            regBtn.classList.add('active');
            regBtn.style.background = 'var(--primary)';
            regBtn.style.color = 'white';
            loginBtn.classList.remove('active');
            loginBtn.style.background = '';
            loginBtn.style.color = '';
            emailGroup.style.display = 'block';
        }
    };
    
    // Init tab
    if (document.getElementById('tab-cloud-login')) {
        window.toggleCloudSettingsTab('login');
    }

    window.linkCloudSettings = async () => {
        const cloudUrl = document.getElementById('cloud-url').value;
        const username = document.getElementById('cloud-user').value;
        const password = document.getElementById('cloud-pass').value;
        const email = document.getElementById('cloud-email').value;
        const isRegister = document.getElementById('tab-cloud-register').classList.contains('active');
        
        const btn = document.getElementById('btn-link-cloud');
        
        if (!username || !password) return alert('Please enter username and password');
        if (isRegister && !email) return alert('Please enter email');
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = isRegister ? 'Registering & Linking...' : 'Linking...';
        
        try {
            const payload = { 
                cloudUrl, 
                username, 
                password, 
                hubName: 'My Home Hub', // Could make this editable
                email: isRegister ? email : null
            };

            const res = await fetch('/api/setup/link-cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                alert('Successfully linked!');
                // Update UI to show linked status
                checkCloudStatus();
            } else {
                alert('Failed: ' + data.error);
            }
        } catch (e) {
            alert('Error: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    // --- User Management Logic ---
    const usersTableBody = document.querySelector('#usersTable tbody');
    const addUserModal = document.getElementById('addUserModal');
    const btnAddUser = document.getElementById('btnAddUser');
    const closeAddUserModal = document.getElementById('closeAddUserModal');
    const addUserForm = document.getElementById('addUserForm');

    async function loadUsers() {
        if (!usersTableBody) return;
        usersTableBody.innerHTML = `<tr><td colspan="4">${window.t ? window.t('loading') : 'Laden...'}</td></tr>`;
        try {
            const res = await fetch('/api/users');
            const data = await res.json();
            if (data.ok) {
                usersTableBody.innerHTML = '';
                data.users.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border)';
                    
                    // Role Dropdown
                    const roleSelect = document.createElement('select');
                    roleSelect.className = 'form-control';
                    roleSelect.style.padding = '5px';
                    roleSelect.style.background = 'var(--bg)';
                    roleSelect.style.color = 'var(--text)';
                    roleSelect.style.border = '1px solid var(--border)';
                    roleSelect.style.borderRadius = '4px';
                    
                    ['User', 'Admin', 'Guest'].forEach(role => {
                        const opt = document.createElement('option');
                        opt.value = role;
                        let label = role;
                        if (window.t) {
                            if (role === 'User') label = window.t('user_role_user');
                            else if (role === 'Admin') label = window.t('user_role_admin');
                            else if (role === 'Guest') label = window.t('user_role_guest');
                        } else {
                            if (role === 'User') label = 'Bewoner';
                            else if (role === 'Admin') label = 'Beheerder';
                            else if (role === 'Guest') label = 'Gast';
                        }
                        opt.textContent = label;
                        if (user.Role === role || (role === 'User' && !user.Role)) opt.selected = true;
                        roleSelect.appendChild(opt);
                    });
                    
                    roleSelect.onchange = async () => {
                        try {
                            await fetch(`/api/users/${user.Id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role: roleSelect.value })
                            });
                        } catch (e) {
                            alert(window.t ? window.t('error_updating_role') : 'Fout bij updaten rol');
                        }
                    };

                    // Delete Button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-danger btn-sm';
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    deleteBtn.onclick = async () => {
                        const confirmMsg = window.t ? window.t('delete_user_confirm').replace('{name}', user.Username) : `Weet je zeker dat je gebruiker "${user.Username}" wilt verwijderen?`;
                        if (confirm(confirmMsg)) {
                            try {
                                const delRes = await fetch(`/api/users/${user.Id}`, { method: 'DELETE' });
                                if (delRes.ok) loadUsers();
                                else alert(window.t ? window.t('error_deleting_user') : 'Fout bij verwijderen');
                            } catch (e) {
                                alert(window.t ? window.t('network_error') : 'Netwerkfout');
                            }
                        }
                    };

                    tr.innerHTML = `
                        <td style="padding: 10px;">${user.Username}</td>
                        <td style="padding: 10px;"></td>
                        <td style="padding: 10px;">${new Date(user.CreatedAt).toLocaleDateString()}</td>
                        <td style="padding: 10px;"></td>
                    `;
                    
                    tr.children[1].appendChild(roleSelect);
                    tr.children[3].appendChild(deleteBtn);
                    
                    usersTableBody.appendChild(tr);
                });
            } else {
                usersTableBody.innerHTML = `<tr><td colspan="4">${window.t ? window.t('error') : 'Fout'}</td></tr>`;
            }
        } catch (e) {
            console.error(e);
            usersTableBody.innerHTML = `<tr><td colspan="4">${window.t ? window.t('network_error') : 'Netwerkfout'}</td></tr>`;
        }
    }

    // Hook into tab switching to load users
    const originalTabClick = document.querySelectorAll('.settings-nav-item');
    originalTabClick.forEach(item => {
        item.addEventListener('click', () => {
            if (item.dataset.target === 'users') {
                loadUsers();
            }
        });
    });

    // Modal Logic
    if (btnAddUser) {
        btnAddUser.onclick = () => { addUserModal.style.display = 'block'; };
        closeAddUserModal.onclick = () => { addUserModal.style.display = 'none'; };
        window.onclick = (event) => {
            if (event.target == addUserModal) {
                addUserModal.style.display = 'none';
            }
        };
        
        addUserForm.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('newUsername').value;
            const password = document.getElementById('newPassword').value;
            const role = document.getElementById('newRole').value;
            
            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role })
                });
                const data = await res.json();
                if (data.ok) {
                    addUserModal.style.display = 'none';
                    addUserForm.reset();
                    loadUsers();
                    alert(window.t ? window.t('add_user_success') : 'Gebruiker succesvol toegevoegd');
                } else {
                    alert((window.t ? window.t('add_user_error') : 'Fout') + ': ' + data.message);
                }
            } catch (e) {
                alert((window.t ? window.t('network_error') : 'Netwerkfout') + ': ' + e.message);
            }
        };
    } // End of if(usersTable)
}); // End of DOMContentLoaded

async function fetchHubSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const settings = await res.json();
            const elName = document.getElementById('hubName');
            if (elName) elName.textContent = settings.name;
            const elId = document.getElementById('hubId');
            if (elId) elId.textContent = settings.hubId;
            const elVer = document.getElementById('hubVersion');
            if (elVer) elVer.textContent = settings.version;
            
            const tzSelect = document.getElementById('timezoneSelect');
            if (tzSelect && settings.timezone) {
                tzSelect.value = settings.timezone;
            }

            // Sync features toggles
            if (settings.features) {
                const setToggle = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.checked = val;
                };
                setToggle('featureAdaptiveLighting', settings.features.adaptiveLighting);
                setToggle('featureClimate', settings.features.climateControl);
                setToggle('featureEnergy', settings.features.energySaver);
                setToggle('featureSecurity', settings.features.securitySystem);
            }
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

window.updateTimezone = async (tz) => {
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: tz })
        });
    } catch (e) {
        console.error('Failed to save timezone:', e);
        alert('Failed to save timezone');
    }
};
// --- Scene Configuration Logic ---
async function initSceneSetup() {
    const container = document.getElementById('scene-mappings-container');
    if (!container) return; // Not on settings page or element missing

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const [mappingsRes, devicesRes] = await Promise.all([
            fetch('/api/scene-mappings'),
            fetch('/api/devices')
        ]);

        if (!mappingsRes.ok || !devicesRes.ok) throw new Error('Failed to fetch data');

        const mappings = await mappingsRes.json();
        const devices = await devicesRes.json();
        
        // Filter out useful devices (lights, switches, input_booleans)
        const usefulDevices = devices.filter(d => 
            d.type.includes('light') || 
            d.type === 'switch' || 
            d.type === 'dimmer'
        );

        container.innerHTML = ''; // Clear spinner

        // Define friendly names for known abstract IDs
        const friendlyNames = {
            "living_main": "Woonkamer Hoofdlicht",
            "living_spots": "Woonkamer Spots",
            "tv_backlight": "TV Achtergrondverlichting",
            "hallway_light": "Gang Licht",
            "kitchen_main": "Keuken Hoofdlicht",
            "kitchen_counter": "Keuken Werkblad",
            "office_main": "Bureau Licht",
            "tv_living": "TV Woonkamer",
            "living_tv": "TV Woonkamer (Alt)",
            "all_lights": "Alle Lampen (Macro)", // Should probably not be mapped
            "all_blinds": "Alle Gordijnen (Macro)"
        };

        Object.keys(mappings).forEach(role => {
            const currentDeviceId = mappings[role];
            const friendlyName = friendlyNames[role] || role;

            const div = document.createElement('div');
            div.className = 'form-group mapping-item';
            div.style.background = 'var(--bg-secondary, rgba(255,255,255,0.05))';
            div.style.padding = '10px';
            div.style.borderRadius = '8px';
            div.style.border = '1px solid var(--border)';
            
            let optionsHtml = '<option value="">-- Geen --</option>';
            usefulDevices.forEach(d => {
                const selected = d.id === currentDeviceId ? 'selected' : '';
                optionsHtml += `<option value="${d.id}" ${selected}>${d.name || d.id}</option>`;
            });
            
            // Allow custom value entry if the mapped device is not in discoverable list (e.g. offline)
            if (currentDeviceId && !usefulDevices.find(d => d.id === currentDeviceId)) {
                optionsHtml += `<option value="${currentDeviceId}" selected>${currentDeviceId} (Niet gevonden)</option>`;
            }

            div.innerHTML = `
                <label style="display:block; margin-bottom:5px; font-weight:600;">${friendlyName}</label>
                <div style="font-size:0.8em; color:var(--text-muted); margin-bottom: 5px;">ID: ${role}</div>
                <select class="scene-mapping-select form-control" data-role="${role}" style="width:100%">
                    ${optionsHtml}
                </select>
            `;
            
            container.appendChild(div);
        });

    } catch (e) {
        console.error('Error initializing scene setup:', e);
        container.innerHTML = '<p class="error">Fout bij laden van gegevens.</p>';
    }
}

// Global expose for button click
window.saveSceneMappings = async function() {
    const selects = document.querySelectorAll('.scene-mapping-select');
    const newMappings = {};
    const btn = document.querySelector('#btn-save-mappings'); 

    selects.forEach(select => {
        const role = select.getAttribute('data-role');
        const val = select.value;
        if (role) {
            newMappings[role] = val || null;
        }
    });
    
    // Add visual feedback
    if(btn) btn.textContent = 'Opslaan...';

    try {
        const res = await fetch('/api/scene-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMappings)
        });
        
        if (res.ok) {
            alert('Mappings opgeslagen!');
            // Reload to verify
            if (btn) btn.textContent = 'Opgeslagen!';
        } else {
            alert('Opslaan mislukt.');
        }
    } catch (e) {
        alert('Netwerkfout: ' + e.message);
    } finally {
        setTimeout(() => { if(btn) btn.textContent = 'Opslaan'; }, 2000);
    }
};

// Hook into the tab switcher
const scenesTab = document.querySelector('.settings-nav-item[data-target="scenes"]');
if (scenesTab) {
    scenesTab.addEventListener('click', () => {
        initSceneSetup();
    });
}
// Also attach listener on load in case we start on scenes tab
document.addEventListener('DOMContentLoaded', () => {
   const btn = document.getElementById('btn-save-mappings');
   if(btn) btn.addEventListener('click', window.saveSceneMappings);
   
    // Check URL params for initial tab again
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'scenes') {
        initSceneSetup();
    }
});

// Developer Tools
async function simulateEvent(type, data = {}) {
    try {
        const res = await fetch('/api/simulate/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, data })
        });
        const result = await res.json();
        if (result.ok) {
            // alert(`Event '${type}' triggered!`); // Optional feedback
            console.log(`Event '${type}' triggered successfully`);
        } else {
            alert(`Failed: ${result.error}`);
        }
    } catch (e) {
        console.error(e);
        alert('Request failed');
    }
}
window.simulateEvent = simulateEvent;

/* Backup Restore Logic */
document.addEventListener('DOMContentLoaded', () => {
    const btnRestore = document.getElementById('btnRestore');
    const backupFile = document.getElementById('backupFile');

    if (btnRestore && backupFile) {
        btnRestore.addEventListener('click', () => {
             const file = backupFile.files[0];
             if (!file) {
                 alert('Selecteer eerst een back-up bestand (.json).');
                 return;
             }
             
             if (!confirm('Weet je zeker dat je wilt herstellen? Huidige instellingen worden overschreven en de hub herstart.')) return;

             const reader = new FileReader();
             reader.onload = async (e) => {
                 try {
                     const json = JSON.parse(e.target.result);
                     const res = await fetch('/api/backup/restore', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify(json)
                     });
                     
                     const result = await res.json();
                     if (result.success) {
                         alert(result.message);
                         // Reload page or wait for restart
                         setTimeout(() => window.location.reload(), 3000);
                     } else {
                         alert('Restore mislukt: ' + (result.error || 'Unknown error'));
                     }
                 } catch (err) {
                     console.error(err);
                     alert('Ongeldig back-up bestand of server fout.');
                 }
             };
             reader.readAsText(file);
        });
    }
});

function systemAction(action) {
    if(!confirm('Weet je het zeker?')) return;
    fetch(`/api/system/${action}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                alert('Actie uitgevoerd. App wordt herladen...');
                setTimeout(() => window.location.reload(), 3000);
            }
        })
        .catch(e => alert('Failed: ' + e));
}
window.systemAction = systemAction;

