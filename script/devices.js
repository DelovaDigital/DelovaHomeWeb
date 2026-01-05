let allDevices = []; // Store devices globally for modal access

document.addEventListener('DOMContentLoaded', () => {
    const devicesContainer = document.querySelector('.content-area');
    
    // 1. Create Modal Structure
    if (!document.getElementById('deviceModal')) {
        const modalHtml = `
            <div id="deviceModal" class="device-modal">
                <div class="device-modal-content">
                    <div class="device-modal-header">
                        <h2 id="modalDeviceName">Device Name</h2>
                        <button class="close-modal" onclick="closeDeviceDetail()">&times;</button>
                    </div>
                    <div class="modal-tabs" id="modalTabs" style="display:none;">
                        <div class="modal-tab active" data-tab="controls">Bediening</div>
                        <div class="modal-tab" data-tab="info">Info</div>
                        <div class="modal-tab" data-tab="settings">Instellingen</div>
                    </div>
                    <div id="modalDeviceBody" class="device-modal-body">
                        <!-- Dynamic Content -->
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Tab Logic
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(c => {
                    c.classList.remove('active');
                    if (c.id === `tab-${target}`) c.classList.add('active');
                });
            });
        });

        // Close on outside click
        window.onclick = function(event) {
            const modal = document.getElementById('deviceModal');
            if (event.target == modal) {
                closeDeviceDetail();
            }
            const pairingModal = document.getElementById('pairingModal');
            if (event.target == pairingModal) {
                pairingModal.style.display = 'none';
            }
        }
    }
    
    // Create Pairing Modal if not exists
    if (!document.getElementById('pairingModal')) {
        const pairingHtml = `
            <div id="pairingModal" class="device-modal" style="z-index: 1100;">
                <div class="device-modal-content" style="max-width: 400px;">
                    <div class="device-modal-header">
                        <h2 id="pairingTitle">Apparaat Koppelen</h2>
                        <button class="close-modal" onclick="document.getElementById('pairingModal').style.display='none'">&times;</button>
                    </div>
                    <div class="device-modal-body">
                        <p id="pairingDesc" style="text-align: center; color: #aaa; margin-bottom: 20px;">Voer inloggegevens in.</p>
                        
                        <div class="control-group" style="width: 100%;">
                            <label>Gebruikersnaam</label>
                            <input type="text" id="pair-username" class="modal-input" placeholder="admin / pi / user">
                        </div>
                        
                        <div class="control-group" style="width: 100%;">
                            <label>Wachtwoord</label>
                            <input type="password" id="pair-password" class="modal-input" placeholder="********">
                        </div>

                        <div class="control-group" style="width: 100%; display: none;" id="pair-pin-group">
                            <label>PIN Code (indien nodig)</label>
                            <input type="text" id="pair-pin" class="modal-input" placeholder="1234">
                        </div>

                        <button class="btn btn-primary" style="width: 100%; margin-top: 20px;" onclick="submitPairing()">Verbinden</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', pairingHtml);
    }

    // Create a container for the device grid if it doesn't exist
    let grid = document.querySelector('.device-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'device-grid';
        // Insert after header
        const header = document.querySelector('.page-header');
        if (header && header.nextSibling) {
            header.parentNode.insertBefore(grid, header.nextSibling);
        } else if (header) {
            header.parentNode.appendChild(grid);
        } else {
            devicesContainer.appendChild(grid);
        }
    }

    // let allDevices = []; // Moved to global scope
    const activeStreams = new Map(); // deviceId -> JSMpeg player

    // Scan Button Logic
    const scanBtn = document.getElementById('scanDevicesBtn');
    if (scanBtn) {
        scanBtn.addEventListener('click', async () => {
            const icon = scanBtn.querySelector('i');
            icon.classList.add('fa-spin');
            scanBtn.disabled = true;
            
            try {
                const res = await fetch('/api/devices/scan', { method: 'POST' });
                const data = await res.json();
                if (data.ok) {
                    // Wait a bit for discovery to happen then refresh
                    setTimeout(() => {
                        fetchDevices();
                        icon.classList.remove('fa-spin');
                        scanBtn.disabled = false;
                    }, 3000);
                } else {
                    alert('Scan failed');
                    icon.classList.remove('fa-spin');
                    scanBtn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                icon.classList.remove('fa-spin');
                scanBtn.disabled = false;
            }
        });
    }

    function startCameraStream(deviceId, ip, containerId) {
        if (activeStreams.has(deviceId)) {
            // Check if the container actually has the video element
            const container = document.getElementById(containerId);
            const hasVideo = container && container.querySelector('video');
            
            if (hasVideo) {
                return; // Stream is active and video is present. All good.
            } else {
                // Stream is active in memory, but DOM is missing (e.g. re-render).
                // We must destroy the old stream and let it recreate.
                console.log('Stream active but DOM missing. Restarting stream...');
                const player = activeStreams.get(deviceId);
                if (player && typeof player.destroy === 'function') {
                    try { player.destroy(); } catch(e) { console.error(e); }
                }
                activeStreams.delete(deviceId); // Ensure it's gone
            }
        }

        const storedCreds = localStorage.getItem(`camera_creds_${deviceId}`);
        
        if (!storedCreds) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div id="camera-login-${deviceId}" class="camera-login">
                        <i class="fas fa-lock camera-icon"></i>
                        <h3>Camera Login</h3>
                        <input class="camera-input" type="text" id="cam-user-${deviceId}" placeholder="Gebruikersnaam">
                        <input class="camera-input" type="password" id="cam-pass-${deviceId}" placeholder="Wachtwoord">
                        <button id="btn-connect-${deviceId}" class="camera-btn">Verbinden</button>
                    </div>
                `;

                const btn = document.getElementById(`btn-connect-${deviceId}`);
                if (btn) {
                    btn.onclick = async () => {
                        const user = document.getElementById(`cam-user-${deviceId}`).value;
                        const pass = document.getElementById(`cam-pass-${deviceId}`).value;
                        if (user && pass) {
                            // Save to backend
                            try {
                                await fetch('/api/device/credentials', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ip, username: user, password: pass, type: 'camera' })
                                });
                            } catch (e) {
                                console.error('Failed to save credentials to server:', e);
                            }

                            localStorage.setItem(`camera_creds_${deviceId}`, JSON.stringify({ user, pass }));
                            // Retry stream
                            startCameraStream(deviceId, ip, containerId);
                        }
                    };
                }
            }
            return;
        }

        const { user, pass } = JSON.parse(storedCreds);
        const rtspUrl = `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:554/stream1`; 

        // Construct WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Use /stream endpoint to avoid conflict with generic /ws
        const wsUrl = `${protocol}//${window.location.host}/stream?deviceId=${deviceId}&rtspUrl=${encodeURIComponent(rtspUrl)}`;

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = ''; // Clear placeholder
            
            // Create Canvas for JSMpeg
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.borderRadius = '10px';
            canvas.style.position = 'relative';
            canvas.style.zIndex = '10';
            container.appendChild(canvas);

            const player = new JSMpeg.Player(wsUrl, {
                canvas: canvas,
                autoplay: true,
                audio: false,
                disableGl: false
            });

            // Add "Edit Credentials" button overlay
            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<i class="fas fa-key"></i>';
            editBtn.className = 'btn-edit-creds';
            editBtn.title = 'Change Credentials';
            editBtn.style.position = 'absolute';
            editBtn.style.top = '10px';
            editBtn.style.left = '10px';
            editBtn.style.zIndex = '20';
            editBtn.style.background = 'rgba(0,0,0,0.5)';
            editBtn.style.color = 'white';
            editBtn.style.border = 'none';
            editBtn.style.borderRadius = '50%';
            editBtn.style.width = '30px';
            editBtn.style.height = '30px';
            editBtn.style.cursor = 'pointer';
            
            editBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Reset camera credentials?')) {
                    localStorage.removeItem(`camera_creds_${deviceId}`);
                    player.destroy();
                    activeStreams.delete(deviceId);
                    startCameraStream(deviceId, ip, containerId);
                }
            };
            
            container.appendChild(editBtn);

            activeStreams.set(deviceId, { 
                destroy: () => { 
                    player.destroy(); 
                    activeStreams.delete(deviceId);
                } 
            });
        }
    }

    function fetchDevices() {
        // Fetch standard devices
        const p1 = fetch('/api/devices').then(res => res.json());
        // Fetch PS5 devices specifically
        const p2 = fetch('/api/ps5/devices').then(res => res.json()).catch(() => []);

        Promise.all([p1, p2])
            .then(([devices, ps5Devices]) => {
                // Merge PS5 devices into main list if not already present
                ps5Devices.forEach(ps5 => {
                    if (!devices.find(d => d.id === ps5.id)) {
                        devices.push({
                            id: ps5.id,
                            name: ps5.name,
                            type: 'console',
                            ip: ps5.address,
                            state: { on: ps5.status === 'AWAKE' }
                        });
                    }
                });

                allDevices = devices;
                renderDevices(devices);
                // If modal is open, refresh it
                const modal = document.getElementById('deviceModal');
                if (modal.style.display === 'block') {
                    const openId = modal.dataset.deviceId;
                    // Only update if we are NOT in a sub-view (like Game Library)
                    if (openId && !modal.dataset.isSubView) {
                        const device = devices.find(d => d.id === openId);
                        if (device) updateModalContent(device);
                    }
                }
            })
            .catch(err => console.error('Error fetching devices:', err));
    }

    function updateDeviceCard(device) {
        let card = document.getElementById(`device-card-${device.id}`);
        
        // Determine Icon
        let icon = 'fa-question-circle';
        if (typeof getDeviceIconClass === 'function') {
            icon = getDeviceIconClass(device);
        }

        const type = device.type ? device.type.toLowerCase() : 'unknown';
        const isOn = device.state && device.state.on;
        const statusClass = isOn ? 'on' : 'off';

        if (!card) {
            card = document.createElement('div');
            card.className = `device-card`;
            card.id = `device-card-${device.id}`;
            // Add click handler to open modal
            card.onclick = (e) => {
                // Prevent opening if clicking a button directly
                if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return;
                openDeviceDetail(device.id);
            };
            grid.appendChild(card);
        }

        // Simple Card Content (Summary)
        let summary = '';
        if (isOn) {
            const hasMediaProtocol = (device.protocols && (device.protocols.includes('airplay') || device.protocols.includes('raop') || device.protocols.includes('spotify-connect') || device.protocols.includes('googlecast')));
            
            if (type === 'light') summary = `${device.state.brightness || 100}%`;
            else if (type === 'thermostat') summary = `${device.state.temperature}°C`;
            else if (type === 'sensor') summary = `${device.state.temperature}°C`;
            else if (type === 'lock') summary = device.state.isLocked ? 'Locked' : 'Unlocked';
            else if ((type === 'tv' || type === 'speaker' || type === 'receiver' || hasMediaProtocol) && device.state.mediaTitle) {
                summary = `<span style="font-size: 0.9em; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${device.state.mediaTitle}</span>`;
                if (device.state.mediaArtist) {
                    summary += `<span style="font-size: 0.8em; color: #aaa; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${device.state.mediaArtist}</span>`;
                }
            }
            else summary = 'Aan';
        } else {
            summary = 'Uit';
        }

        const newHtml = `
            <div class="device-card-inner">
                <div class="device-card-top">
                    <div class="device-icon-wrapper ${statusClass}">
                        <i class="${icon}"></i>
                    </div>
                    <div class="device-status-indicator ${statusClass}"></div>
                </div>
                <div class="device-card-middle">
                    <h3 class="device-name">${device.name}</h3>
                    <p class="device-status-text">${summary}</p>
                </div>
                <div class="device-card-bottom">
                    <button class="btn-icon-only" onclick="showDeviceMenu('${device.id}', event); event.stopPropagation();" title="Meer opties">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                    <button class="btn-power ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}'); event.stopPropagation();">
                        <i class="fas fa-power-off"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Only update DOM if content changed to prevent flickering
        if (card.innerHTML !== newHtml) {
            card.innerHTML = newHtml;
        }
    }

    // Listen for real-time updates
    document.addEventListener('device-update', (e) => {
        const updatedDevice = e.detail;
        // Update allDevices array
        const index = allDevices.findIndex(d => d.id === updatedDevice.id);
        if (index !== -1) {
            allDevices[index] = updatedDevice;
        } else {
            allDevices.push(updatedDevice);
        }
        
        // Re-render ONLY the updated device
        updateDeviceCard(updatedDevice);

        // If modal is open for this device, update it
        const modal = document.getElementById('deviceModal');
        if (modal.style.display === 'block' && modal.dataset.deviceId === updatedDevice.id && !modal.dataset.isSubView) {
            updateModalContent(updatedDevice);
        }
    });

    function renderDevices(devices) {
        if (devices.length === 0) {
            grid.innerHTML = '<div class="loading-devices"><i class="fas fa-spinner fa-spin"></i> Apparaten zoeken...</div>';
            return;
        }

        if (grid.querySelector('.loading-devices')) {
            grid.innerHTML = '';
        }

        const currentIds = new Set(devices.map(d => d.id));
        const existingCards = grid.querySelectorAll('.device-card');
        existingCards.forEach(card => {
            const id = card.id.replace('device-card-', '');
            if (!currentIds.has(id)) {
                card.remove();
            }
        });

        devices.forEach(device => {
            updateDeviceCard(device);
        });
    }

    // --- Modal Logic ---

    window.openDeviceDetail = (id) => {
        const device = allDevices.find(d => d.id === id);
        if (!device) return;
        
        console.log('Opening device detail:', device); // Debug

        const modal = document.getElementById('deviceModal');
        modal.dataset.deviceId = id;
        document.getElementById('modalDeviceName').textContent = device.name;
        
        // Reset tabs to Controls
        const tabs = document.querySelectorAll('.modal-tab');
        if (tabs.length > 0) {
            tabs.forEach(t => t.classList.remove('active'));
            const controlTab = document.querySelector('.modal-tab[data-tab="controls"]');
            if (controlTab) controlTab.classList.add('active');
        }
        
        updateModalContent(device, true);
        
        modal.style.display = 'block';
    };

    window.closeDeviceDetail = () => {
        document.getElementById('deviceModal').style.display = 'none';
        activeStreams.forEach((player, deviceId) => {
            // Check if PiP is active for this device
            const pipVideo = document.getElementById(`pip-video-${deviceId}`);
            if (pipVideo && document.pictureInPictureElement === pipVideo) {
                console.log('Keeping stream active for PiP');
                return; // Don't destroy
            }

            try { player.destroy(); } catch(e) {}
            // Notify backend to stop stream
            fetch('/api/camera/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId })
            });
        });
        // Only clear inactive streams
        for (const [deviceId, player] of activeStreams) {
             const pipVideo = document.getElementById(`pip-video-${deviceId}`);
             if (!pipVideo || document.pictureInPictureElement !== pipVideo) {
                 activeStreams.delete(deviceId);
             }
        }
    };

    function updateModalContent(device, force = false) {
        const modalContent = document.querySelector('.device-modal-content');
        const body = document.getElementById('modalDeviceBody');
        
        // Check if user is interacting with an input in the modal
        const activeElement = document.activeElement;
        const isInteracting = activeElement && 
            (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA') && 
            body.contains(activeElement);

        if (isInteracting && !force) {
            console.log('Skipping modal update due to user interaction');
            return;
        }

        const tabsContainer = document.getElementById('modalTabs');
        
        if (tabsContainer) tabsContainer.style.display = 'flex';

        const type = device.type.toLowerCase();
        const isOn = device.state.on;
        
        // Check for media capability
        const hasMediaProtocol = (device.protocols && (device.protocols.includes('airplay') || device.protocols.includes('raop') || device.protocols.includes('spotify-connect') || device.protocols.includes('googlecast')));
        
        const isMedia = (type === 'tv' || type === 'speaker' || type === 'receiver' || 
                        device.protocol === 'mdns-airplay' || device.protocol === 'spotify-connect' ||
                        hasMediaProtocol ||
                        device.name.toLowerCase().includes('denon')) && isOn;
        const isCamera = type === 'camera';

        // Avoid full refresh for camera if stream is active OR if login form is present
        if (isCamera && !force) {
             // Check if stream is active
             if (activeStreams.has(device.id)) {
                 const leftCol = document.querySelector('.modal-left-col');
                 if (leftCol) {
                     const iconEl = leftCol.querySelector('.modal-device-icon');
                     if (iconEl) {
                         if (isOn) iconEl.classList.add('on');
                         else iconEl.classList.remove('on');
                     }
                 }
                 return; 
             }
             
             // Check if login form is present (to prevent overwriting while typing)
             const loginForm = document.getElementById(`camera-login-${device.id}`);
             if (loginForm) {
                 return;
             }
        }

        if (isMedia || isCamera) {
            modalContent.classList.add('wide');
        } else {
            modalContent.classList.remove('wide');
        }
        
        let icon = 'fa-question-circle';
        if (type === 'light') icon = 'fa-lightbulb';
        else if (type === 'tv') icon = 'fa-tv';
        else if (type === 'speaker') icon = 'fa-music';
        else if (type === 'thermostat') icon = 'fa-thermometer-half';
        else if (type === 'lock') icon = device.state.isLocked ? 'fa-lock' : 'fa-lock-open';
        else if (type === 'cover') icon = 'fa-warehouse';
        else if (type === 'vacuum') icon = 'fa-robot';
        else if (type === 'sensor') icon = 'fa-wifi';
        else if (type === 'printer') icon = 'fa-print';
        else if (type === 'receiver' || device.name.toLowerCase().includes('denon')) icon = 'fa-compact-disc';
        else if (type === 'camera') icon = 'fa-video';
        else if (type === 'ps5' || type === 'console') icon = 'fa-gamepad';
        else if (type === 'shelly' || type === 'switch') icon = 'fa-toggle-on';
        else if (type === 'computer' || type === 'workstation' || type === 'pc' || type === 'mac') icon = 'fa-desktop';
        else if (type === 'nas') icon = 'fa-server';
        else if (type === 'raspberrypi' || type === 'rpi') icon = 'fa-microchip';

        let controlsHtml = '';

        // Power Button (except for sensors/locks/cameras/nas)
        if (type !== 'sensor' && type !== 'lock' && type !== 'camera' && type !== 'nas') {
            // For PS5, use specific commands 'wake' and 'standby'
            // For others, use 'toggle' or 'turn_on'/'turn_off'
            let cmd = 'toggle';
            if (type === 'ps5' || type === 'console') {
                cmd = isOn ? 'standby' : 'wake';
            } else if ((type === 'pc' || type === 'rpi' || type === 'computer' || type === 'workstation' || type === 'mac') && !isOn) {
                cmd = 'wake';
            }
            
            controlsHtml += `
                <button class="big-power-btn ${isOn ? 'on' : ''}" onclick="controlDevice('${device.id}', '${cmd}')">
                    <i class="fas fa-power-off"></i>
                </button>
            `;
        }

        // Shelly Power Meter
        if (type === 'shelly' && device.state.power !== undefined) {
            controlsHtml += `
                <div class="control-group">
                    <label>Huidig verbruik</label>
                    <div style="font-size: 1.5em; font-weight: bold;">${device.state.power} W</div>
                </div>
            `;
        }

        // Specific Controls
        if (type === 'ps5' || type === 'console' || type === 'playstation' || device.name.toLowerCase().includes('ps5')) {
             controlsHtml += `
                <div class="remote-control">
                    <div class="d-pad">
                        <button class="d-pad-btn d-pad-up" onclick="controlPS5('${device.id}', 'up')"><i class="fas fa-chevron-up"></i></button>
                        <button class="d-pad-btn d-pad-left" onclick="controlPS5('${device.id}', 'left')"><i class="fas fa-chevron-left"></i></button>
                        <button class="d-pad-btn d-pad-center" onclick="controlPS5('${device.id}', 'enter')">OK</button>
                        <button class="d-pad-btn d-pad-right" onclick="controlPS5('${device.id}', 'right')"><i class="fas fa-chevron-right"></i></button>
                        <button class="d-pad-btn d-pad-down" onclick="controlPS5('${device.id}', 'down')"><i class="fas fa-chevron-down"></i></button>
                    </div>
                    <div class="remote-actions" style="display: flex; gap: 15px; margin-top: 20px;">
                        <button class="action-btn" onclick="controlPS5('${device.id}', 'back')"><i class="fas fa-arrow-left"></i> Back</button>
                        <button class="action-btn" onclick="controlPS5('${device.id}', 'home')"><i class="fas fa-home"></i> Home</button>
                        <button class="action-btn" onclick="controlPS5('${device.id}', 'options')"><i class="fas fa-bars"></i> Options</button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button class="btn btn-primary" style="padding: 10px 20px;" onclick="controlPS5('${device.id}', 'wake')">
                            <i class="fas fa-power-off"></i> Wake
                        </button>
                        <button class="btn btn-secondary" style="padding: 10px 20px; background-color: #dc3545; color: white;" onclick="controlPS5('${device.id}', 'standby')">
                            <i class="fas fa-moon"></i> Standby
                        </button>
                    </div>

                    <div style="margin-top: 15px; width: 100%; display: flex; flex-direction: column; gap: 10px; align-items: center;">
                        <button class="btn btn-secondary" style="width: 80%;" onclick="startPS5Pairing('${device.id}')">
                            <i class="fas fa-link"></i> Pair PS5
                        </button>
                        <button class="btn btn-secondary" style="width: 80%; background-color: #003791;" onclick="showPS5Games('${device.id}')">
                            <i class="fas fa-gamepad"></i> Game Library
                        </button>
                    </div>
                </div>
            `;
        } else if (type === 'light' && isOn) {
            controlsHtml += `
                <div class="modal-control-group">
                    <div class="modal-slider-container">
                        <label class="modal-slider-label" style="display:block; margin-bottom:10px; font-weight:500;">Helderheid: ${device.state.brightness || 0}%</label>
                        <input type="range" class="modal-slider" min="0" max="100" value="${device.state.brightness || 0}"
                            onchange="controlDevice('${device.id}', 'set_brightness', this.value)">
                    </div>
                </div>
                <div class="modal-control-group">
                    <label style="display:block; margin-bottom:10px; font-weight:500;">Kleur</label>
                    <div class="color-palette">
                        <div class="color-swatch" style="background: #ffffff" onclick="controlDevice('${device.id}', 'set_color', {r:255,g:255,b:255})"></div>
                        <div class="color-swatch" style="background: #ff0000" onclick="controlDevice('${device.id}', 'set_color', {r:255,g:0,b:0})"></div>
                        <div class="color-swatch" style="background: #00ff00" onclick="controlDevice('${device.id}', 'set_color', {r:0,g:255,b:0})"></div>
                        <div class="color-swatch" style="background: #0000ff" onclick="controlDevice('${device.id}', 'set_color', {r:0,g:0,b:255})"></div>
                        <div class="color-swatch" style="background: #ffa500" onclick="controlDevice('${device.id}', 'set_color', {r:255,g:165,b:0})"></div>
                        <div class="color-swatch" style="background: #800080" onclick="controlDevice('${device.id}', 'set_color', {r:128,g:0,b:128})"></div>
                        <div class="color-swatch" style="background: #00ffff" onclick="controlDevice('${device.id}', 'set_color', {r:0,g:255,b:255})"></div>
                        <div class="color-swatch" style="background: #ffc0cb" onclick="controlDevice('${device.id}', 'set_color', {r:255,g:192,b:203})"></div>
                    </div>
                </div>
            `;
        } else if (type === 'tv' && isOn) {
            controlsHtml += `
                <div class="remote-control">
                    <div class="d-pad">
                        <button class="d-pad-btn d-pad-up" onclick="controlDevice('${device.id}', 'up')"><i class="fas fa-chevron-up"></i></button>
                        <button class="d-pad-btn d-pad-left" onclick="controlDevice('${device.id}', 'left')"><i class="fas fa-chevron-left"></i></button>
                        <button class="d-pad-btn d-pad-center" onclick="controlDevice('${device.id}', 'select')"><i class="fas fa-circle"></i></button>
                        <button class="d-pad-btn d-pad-right" onclick="controlDevice('${device.id}', 'right')"><i class="fas fa-chevron-right"></i></button>
                        <button class="d-pad-btn d-pad-down" onclick="controlDevice('${device.id}', 'down')"><i class="fas fa-chevron-down"></i></button>
                    </div>
                    <div class="remote-grid">
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'back')"><i class="fas fa-arrow-left"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'home')"><i class="fas fa-home"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'menu')"><i class="fas fa-bars"></i></button>
                        
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'previous')"><i class="fas fa-step-backward"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'play')"><i class="fas fa-play"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'next')"><i class="fas fa-step-forward"></i></button>
                        
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_down')"><i class="fas fa-minus"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'mute')"><i class="fas fa-volume-mute"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_up')"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            `;
        } else if (type === 'nas') {
            controlsHtml += `<div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin-top: 20px;">`;
            
            if (device.isPaired) {
                controlsHtml += `
                    <button class="btn btn-secondary" style="width: 100%; padding: 12px; background-color: #6c757d; color: white; border: none; border-radius: 5px;" onclick="window.location.href='files.html?device=${device.id}'">
                        <i class="fas fa-folder-open"></i> Naar bestanden
                    </button>
                    <button class="btn btn-danger" style="width: 100%; padding: 12px; margin-top: 10px;" onclick="unpairDevice('${device.id}')">
                        <i class="fas fa-trash"></i> Verwijder credentials
                    </button>
                `;
            } else {
                controlsHtml += `
                    <p>Voeg dit apparaat toe aan mijn bestanden.</p>
                    <button class="btn btn-primary" style="width: 100%; padding: 12px;" onclick="showPairingModal('${device.id}')">
                        <i class="fas fa-key"></i> Inloggen / Koppelen
                    </button>
                `;
            }
            
            controlsHtml += `</div>`;

        } else if (type === 'pc' || type === 'computer' || type === 'workstation' || type === 'raspberrypi' || type === 'rpi' || type === 'mac') {
            const isWindows = type.includes('pc') || type.includes('computer') || type.includes('workstation') || device.name.toLowerCase().includes('windows') || device.name.toLowerCase().includes('win');
            
            controlsHtml += `
                <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin-top: 20px;">
                    <p>Beheer verbindingen en bestanden.</p>
            `;

            if (!device.isPaired) {
                controlsHtml += `
                    <button class="btn btn-primary" style="width: 100%; padding: 12px;" onclick="showPairingModal('${device.id}')">
                        <i class="fas fa-key"></i> Inloggen / Koppelen
                    </button>
                `;
            } else {
                controlsHtml += `
                    <button class="btn btn-danger" style="width: 100%; padding: 12px;" onclick="unpairDevice('${device.id}')">
                        <i class="fas fa-trash"></i> Verwijder credentials
                    </button>
                `;
            }
            
            controlsHtml += `
                    <div style="display: flex; gap: 10px; width: 100%;">
            `;

            if (device.wol_configured) {
                controlsHtml += `
                        <button class="btn btn-secondary" style="flex: 1; padding: 12px;" onclick="controlDevice('${device.id}', 'wake')">
                            <i class="fas fa-power-off"></i> Wake on LAN
                        </button>
                `;
            }

            if (isWindows) {
                controlsHtml += `
                        <button class="btn btn-secondary" style="flex: 1; padding: 12px;" onclick="window.open('https://remotedesktop.google.com/access/', '_blank')">
                            <i class="fas fa-desktop"></i> Remote Desktop
                        </button>
                `;
            } else {
                 controlsHtml += `
                        <button class="btn btn-secondary" style="flex: 1; padding: 12px;" onclick="launchRemote('${device.ip}', '${type}')">
                            <i class="fas fa-desktop"></i> Remote
                        </button>
                 `;
            }

            controlsHtml += `
                    </div>
            `;

            if (device.shares_folders && device.isPaired) {
                controlsHtml += `
                    <button class="btn btn-secondary" style="width: 100%; padding: 12px; background-color: #6c757d; color: white; border: none; border-radius: 5px;" onclick="window.location.href='files.html?device=${device.id}'">
                        <i class="fas fa-folder-open"></i> Naar bestanden
                    </button>
                `;
            }

            controlsHtml += `
                </div>
            `;
        } else if (type === 'printer') {
             let inkHtml = '';
             if (device.state.inks && device.state.inks.length > 0) {
                 inkHtml = '<div style="display: flex; gap: 15px; width: 100%; margin-top: 20px; justify-content: center;">';
                 device.state.inks.forEach(ink => {
                     let colorCode = '#000';
                     if (ink.color === 'C') colorCode = '#00FFFF';
                     else if (ink.color === 'M') colorCode = '#FF00FF';
                     else if (ink.color === 'Y') colorCode = '#FFFF00';
                     else if (ink.color === 'K') colorCode = '#000000';
                     
                     inkHtml += `
                         <div style="display: flex; flex-direction: column; align-items: center; width: 60px;">
                             <div style="width: 100%; height: 100px; background: #eee; border-radius: 8px; position: relative; overflow: hidden; border: 1px solid #ddd;">
                                 <div style="position: absolute; bottom: 0; left: 0; right: 0; height: ${ink.level}%; background-color: ${colorCode}; transition: height 0.5s;"></div>
                             </div>
                             <span style="font-size: 0.9em; margin-top: 8px; font-weight: bold;">${ink.level}%</span>
                         </div>
                     `;
                 });
                 inkHtml += '</div>';
             } else {
                 inkHtml = '<div style="text-align: center; color: #888; margin-top: 20px;">Inktniveaus onbekend</div>';
             }
             controlsHtml += inkHtml;
        } else if (type === 'receiver' || device.name.toLowerCase().includes('denon') || device.protocol === 'denon-avr') {
             const defaultInputs = ['TV', 'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4', 'Bluetooth', 'AUX', 'Tuner', 'NET', 'Phono', 'CD'];
             const inputs = device.inputs || defaultInputs;
             
             let inputOptions = inputs.map(inp => {
                 const val = typeof inp === 'string' ? inp.toLowerCase() : inp.id;
                 const label = typeof inp === 'string' ? inp : inp.name;
                 return `<option value="${val}">${label}</option>`;
             }).join('');

             controlsHtml += `
                <div class="modal-slider-container">
                    <label class="modal-slider-label">Volume: ${device.state.volume || 0}%</label>
                    <input type="range" class="modal-slider" min="0" max="100" value="${device.state.volume || 0}"
                        onchange="controlDevice('${device.id}', 'set_volume', this.value)">
                </div>
                <div class="control-group" style="margin-top: 20px;">
                    <select class="input-selector" onchange="controlDevice('${device.id}', 'set_input', this.value)" style="width: 100%; padding: 10px; font-size: 1.1em;">
                        <option value="" disabled selected>Bron selecteren</option>
                        ${inputOptions}
                    </select>
                </div>
                <div class="remote-grid" style="margin-top: 20px;">
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'previous')"><i class="fas fa-step-backward"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'play')"><i class="fas fa-play"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'next')"><i class="fas fa-step-forward"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'mute')"><i class="fas fa-volume-mute"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_down')"><i class="fas fa-minus"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_up')"><i class="fas fa-plus"></i></button>
                </div>
             `;
        } else if (type === 'thermostat') {
            controlsHtml += `
                <div class="temp-display-large">${device.state.targetTemperature || 21}°C</div>
                <div class="modal-slider-container">
                    <input type="range" class="modal-slider" min="10" max="30" step="0.5" value="${device.state.targetTemperature || 21}"
                        onchange="controlDevice('${device.id}', 'set_temperature', this.value)">
                </div>
                <div class="mode-buttons">
                    <button class="mode-btn ${device.state.mode === 'heat' ? 'active' : ''}" onclick="controlDevice('${device.id}', 'set_mode', 'heat')">
                        <i class="fas fa-fire"></i> Heat
                    </button>
                    <button class="mode-btn ${device.state.mode === 'cool' ? 'active' : ''}" onclick="controlDevice('${device.id}', 'set_mode', 'cool')">
                        <i class="fas fa-snowflake"></i> Cool
                    </button>
                    <button class="mode-btn ${device.state.mode === 'auto' ? 'active' : ''}" onclick="controlDevice('${device.id}', 'set_mode', 'auto')">
                        <i class="fas fa-sync"></i> Auto
                    </button>
                </div>
            `;
        } else if (type === 'lock') {
            const isLocked = device.state.isLocked;
            controlsHtml += `
                <button class="big-power-btn" style="background-color: ${isLocked ? '#dc3545' : '#28a745'}; width: 100px; height: 100px;" 
                    onclick="controlDevice('${device.id}', '${isLocked ? 'unlock' : 'lock'}')">
                    <i class="fas ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <p>${isLocked ? 'Vergrendeld' : 'Ontgrendeld'}</p>
            `;
        } else if (type === 'cover' || type === 'blind') {
            controlsHtml += `
                <div class="modal-slider-container">
                    <label class="modal-slider-label">Positie: ${device.state.position || 0}%</label>
                    <input type="range" class="modal-slider" min="0" max="100" value="${device.state.position || 0}"
                        onchange="controlDevice('${device.id}', 'set_position', this.value)">
                </div>
                <div class="remote-grid">
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'open')"><i class="fas fa-arrow-up"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'stop')"><i class="fas fa-stop"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'close')"><i class="fas fa-arrow-down"></i></button>
                </div>
            `;
        } else if (type === 'vacuum') {
            controlsHtml += `
                <div class="remote-grid">
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'start')"><i class="fas fa-play"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'pause')"><i class="fas fa-pause"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'dock')"><i class="fas fa-home"></i></button>
                </div>
            `;
        } else if (type === 'sensor') {
            controlsHtml += `
                <div style="display: flex; gap: 30px; font-size: 1.2em;">
                    <div style="text-align: center;">
                        <i class="fas fa-thermometer-half" style="color: #ff6b6b; font-size: 2em; display: block; margin-bottom: 10px;"></i>
                        ${device.state.temperature || '--'}°C
                    </div>
                    <div style="text-align: center;">
                        <i class="fas fa-tint" style="color: #4dabf7; font-size: 2em; display: block; margin-bottom: 10px;"></i>
                        ${device.state.humidity || '--'}%
                    </div>
                    <div style="text-align: center;">
                        <i class="fas fa-battery-half" style="color: #51cf66; font-size: 2em; display: block; margin-bottom: 10px;"></i>
                        ${device.state.battery || '--'}%
                    </div>
                </div>
            `;
        } else if (type === 'camera') {
            controlsHtml += `
                <div class="d-pad" style="margin-bottom: 20px;">
                    <button class="d-pad-btn d-pad-up" onclick="controlDevice('${device.id}', 'nudge_up')"><i class="fas fa-chevron-up"></i></button>
                    
                    <button class="d-pad-btn d-pad-left" onclick="controlDevice('${device.id}', 'nudge_left')"><i class="fas fa-chevron-left"></i></button>
                    
                    <button class="d-pad-btn d-pad-center" onclick="controlDevice('${device.id}', 'ptz_home')"><i class="fas fa-home"></i></button>
                    
                    <button class="d-pad-btn d-pad-right" onclick="controlDevice('${device.id}', 'nudge_right')"><i class="fas fa-chevron-right"></i></button>
                    
                    <button class="d-pad-btn d-pad-down" onclick="controlDevice('${device.id}', 'nudge_down')"><i class="fas fa-chevron-down"></i></button>
                </div>
                <div class="remote-grid">
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'snapshot')" title="Snapshot"><i class="fas fa-camera"></i></button>
                    <button class="remote-btn" onclick="togglePiP('${device.id}')" title="Picture in Picture"><i class="fas fa-external-link-alt"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'record')" title="Opnemen"><i class="fas fa-circle"></i></button>
                </div>
                <div class="control-group" style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 20px;">
                    <button class="btn btn-secondary" style="width: 100%; padding: 12px;" onclick="showPairingModal('${device.id}')">
                        <i class="fas fa-key"></i> Inloggen / Koppelen
                    </button>
                </div>
            `;
        }

        // Add Pairing Button for Android TV / Google TV
        // Show for explicit protocol OR generic TVs that aren't other known brands
        const proto = device.protocol || '';
        const isOtherTv = device.type === 'tv' && 
                          !proto.includes('samsung') && 
                          !proto.includes('webos') && 
                          !proto.includes('airplay') &&
                          !device.name.toLowerCase().includes('samsung') &&
                          !device.name.toLowerCase().includes('lg') &&
                          !device.name.toLowerCase().includes('apple');

        if (proto === 'mdns-googlecast' || isOtherTv) {
             controlsHtml += `
                <div class="control-group" style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 20px;">
                    <button class="btn-secondary" style="width: 100%; padding: 12px;" onclick="startPairing('${device.ip}', '${device.name}')">
                        <i class="fas fa-link"></i> Handmatig Koppelen
                    </button>
                </div>
             `;
        }

        // --- BUILD TABS ---

        // 1. Controls Tab
        let tabControlsContent = '';
        if (isMedia) {
            const title = device.state.mediaTitle || 'Geen media';
            const artist = device.state.mediaArtist || '';
            const album = device.state.mediaAlbum || '';
            const app = device.state.mediaApp || '';
            const state = device.state.playingState || 'stopped';
            
            let artContent = `<i class="fas fa-music"></i>`;
            if (app.toLowerCase().includes('spotify')) artContent = `<i class="fab fa-spotify" style="color: #1db954;"></i>`;
            else if (app.toLowerCase().includes('netflix')) artContent = `<span style="color: #e50914; font-weight: bold; font-size: 0.5em;">NETFLIX</span>`;
            else if (app.toLowerCase().includes('youtube')) artContent = `<i class="fab fa-youtube" style="color: #ff0000;"></i>`;

            tabControlsContent = `
                <div style="display: flex; flex-direction: row; width: 100%; gap: 20px; align-items: flex-start;">
                    <div class="modal-left-col">
                        <i class="fas ${icon} modal-device-icon ${isOn ? 'on' : ''}"></i>
                        ${controlsHtml}
                    </div>
                    <div class="modal-right-col">
                        <div class="media-info-panel">
                            <div class="album-art">${artContent}</div>
                            <div class="media-text">
                                <h3>${title}</h3>
                                <p>${artist}</p>
                                <p class="album-name">${album}</p>
                                <div style="margin-top: 10px; font-size: 0.8em; color: #666;">
                                    <i class="fas ${state === 'playing' ? 'fa-play' : 'fa-pause'}"></i> ${app}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (isCamera) {
            tabControlsContent = `
                <div style="display: flex; flex-direction: row; width: 100%; gap: 20px; align-items: flex-start;">
                    <div class="modal-left-col">
                        <i class="fas ${icon} modal-device-icon on"></i>
                        <div style="margin-bottom: 20px; font-size: 1.2em; color: #aaa;">${device.ip}</div>
                        ${controlsHtml}
                    </div>
                    <div class="modal-right-col">
                        <div class="camera-view" id="camera-container-${device.id}">
                            <div class="camera-placeholder">
                                <i class="fas fa-circle-notch fa-spin" style="font-size: 4em; color: #555; margin-bottom: 20px;"></i>
                                <p>Verbinden met camera...</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            tabControlsContent = `
                <i class="fas ${icon} modal-device-icon ${isOn ? 'on' : ''}"></i>
                ${controlsHtml}
            `;
        }

        // 2. Info Tab
        const infoContent = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; text-align: left;">
                <div style="color: #888;">Naam:</div><div>${device.name}</div>
                <div style="color: #888;">Type:</div><div>${device.type}</div>
                <div style="color: #888;">IP Adres:</div><div>${device.ip || 'Onbekend'}</div>
                <div style="color: #888;">MAC Adres:</div><div>${device.mac || 'Onbekend'}</div>
                <div style="color: #888;">Protocol:</div><div>${device.protocol || 'Onbekend'}</div>
                <div style="color: #888;">Status:</div><div>${device.state.on ? 'Aan' : 'Uit'}</div>
                <div style="color: #888;">ID:</div><div style="font-size: 0.8em; word-break: break-all;">${device.id}</div>
            </div>
        `;

        // 3. Settings Tab
        const settingsContent = `
            <div style="width: 100%; display: flex; flex-direction: column; gap: 20px;">
                <div class="control-group">
                    <label style="display: block; margin-bottom: 10px;">Apparaat Hernoemen</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="rename-input-${device.id}" value="${device.name}" style="flex: 1; padding: 10px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg);">
                        <button class="btn btn-primary" onclick="renameDevice('${device.id}')">Opslaan</button>
                    </div>
                </div>
                <div class="control-group">
                    <label style="display: block; margin-bottom: 10px;">Kamer Toewijzen</label>
                    <button class="btn btn-secondary" style="width: 100%;" onclick="assignRoom('${device.id}')">Kies Kamer</button>
                </div>
                <div class="control-group" style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 20px;">
                    <button class="btn btn-secondary" style="width: 100%; background-color: #dc3545; color: white;" onclick="deleteDevice('${device.id}')">
                        <i class="fas fa-trash"></i> Verwijder Apparaat
                    </button>
                </div>
            </div>
        `;

        // Determine active tab
        const activeTabEl = document.querySelector('.modal-tab.active');
        const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'controls';

        const newHtml = `
            <div id="tab-controls" class="tab-content ${activeTab === 'controls' ? 'active' : ''}">
                ${tabControlsContent}
            </div>
            <div id="tab-info" class="tab-content ${activeTab === 'info' ? 'active' : ''}">
                ${infoContent}
            </div>
            <div id="tab-settings" class="tab-content ${activeTab === 'settings' ? 'active' : ''}">
                ${settingsContent}
            </div>
        `;

        // Only update if content changed to prevent flickering
        if (body.innerHTML !== newHtml) {
            body.innerHTML = newHtml;
        }

        if (isCamera) {
            startCameraStream(device.id, device.ip, `camera-container-${device.id}`);
        }
        
        // Helper functions for settings
        window.renameDevice = async (id) => {
            const input = document.getElementById(`rename-input-${id}`);
            if (input && input.value.trim()) {
                await fetch(`/api/devices/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: input.value.trim() }) });
                fetchDevices();
                closeDeviceDetail();
            }
        };
        
        window.assignRoom = async (deviceId) => {
             if (typeof window.showRoomPicker === 'function') {
                const roomId = await window.showRoomPicker({ deviceId });
                if (roomId) { 
                    await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId }) }); 
                    fetchDevices(); 
                    closeDeviceDetail();
                }
            } else {
                alert('Room picker niet beschikbaar');
            }
        };
        
        window.deleteDevice = async (id) => {
            if(confirm('Weet je zeker dat je dit apparaat wilt verwijderen?')) {
                alert('Verwijderen nog niet geïmplementeerd in API');
            }
        };
    }

    window.startPairing = (ip, name) => {
        showPairingModal(ip, name);
        
        // Also trigger the pairing request on the backend
        const device = allDevices.find(d => d.ip === ip);
        if (device) {
            fetch(`/api/devices/${device.id}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'start_pairing' })
            }).catch(e => console.error('Failed to start pairing:', e));
        }
    };

    window.launchRemote = (ip, type) => {
        let protocol = 'rdp';
        if (type === 'mac' || type === 'rpi' || type === 'raspberrypi' || type === 'linux') {
            protocol = 'vnc';
        }
        
        const url = `${protocol}://${ip}`;
        console.log(`Launching remote connection: ${url}`);
        
        // Use a temporary link to avoid blank tabs/popups
        const link = document.createElement('a');
        link.href = url;
        // link.target = '_blank'; // Do NOT use _blank for protocols, it causes empty tabs
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    window.togglePiP = async (deviceId) => {
        const container = document.getElementById(`camera-container-${deviceId}`);
        if (!container) return;
        const canvas = container.querySelector('canvas');
        if (!canvas) {
            alert('Stream nog niet geladen');
            return;
        }

        // Check if we already have a pip video for this device
        let pipVideo = document.getElementById(`pip-video-${deviceId}`);
        if (!pipVideo) {
            pipVideo = document.createElement('video');
            pipVideo.id = `pip-video-${deviceId}`;
            pipVideo.style.display = 'none'; // Hidden
            pipVideo.muted = true; // Auto-play policy
            pipVideo.autoplay = true;
            document.body.appendChild(pipVideo);
            
            // Clean up when PiP closes
            pipVideo.addEventListener('leavepictureinpicture', () => {
                // If modal is closed, we should now stop the stream
                const modal = document.getElementById('deviceModal');
                if (modal.style.display === 'none') {
                    const player = activeStreams.get(deviceId);
                    if (player) {
                        try { player.destroy(); } catch(e) {}
                        activeStreams.delete(deviceId);
                        fetch('/api/camera/stop', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ deviceId })
                        });
                    }
                }
                // pipVideo.remove(); // Optional cleanup
            });
        }

        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        } else {
            try {
                // Always refresh stream capture to ensure it's active
                const stream = canvas.captureStream(30);
                pipVideo.srcObject = stream;
                await pipVideo.play();
                await pipVideo.requestPictureInPicture();
            } catch (err) {
                console.error('PiP failed:', err);
                alert('Picture-in-Picture niet ondersteund of mislukt: ' + err.message);
            }
        }
    };

    window.toggleDevice = (id) => {
        fetch(`/api/devices/${id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'toggle' })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) fetchDevices();
        });
    };

    window.controlDevice = (id, command, value) => {
        // Handle color object
        if (command === 'set_color' && typeof value === 'object') {
            // value is already object
        }

        fetch(`/api/devices/${id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, value })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) fetchDevices();
        });
    };

    window.controlPS5 = (id, action) => {
        let endpoint = `/api/ps5/${id}/command`;
        let body = { command: action };

        if (action === 'wake') {
            endpoint = `/api/ps5/${id}/wake`;
            body = {};
        } else if (action === 'standby') {
            endpoint = `/api/ps5/${id}/standby`;
            body = {};
        }

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Optional: show feedback
            } else {
                const errorMsg = data.error || 'Unknown error';
                if (errorMsg.includes('Navigation (D-pad) is not supported')) {
                    alert('PS5 Control Limitation: \n' + errorMsg);
                } else {
                    alert('Error: ' + errorMsg);
                }
            }
        })
        .catch(err => alert('Network error: ' + err));
    };

    window.startPS5Pairing = (id) => {
        // Check if we should unpair first
        if (confirm('Do you want to remove existing pairing first? (Recommended if re-pairing)')) {
            fetch(`/api/ps5/${id}/forget`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        alert('Existing pairing removed. Proceeding to pair...');
                        proceedToPairing(id);
                    } else {
                        alert('Failed to remove pairing: ' + (data.error || data.message));
                        proceedToPairing(id);
                    }
                })
                .catch(e => {
                    console.error(e);
                    proceedToPairing(id);
                });
        } else {
            proceedToPairing(id);
        }
    };

    function proceedToPairing(id) {
        if (!confirm('Ensure your PS5 is ON and you are ready to login to PSN.')) return;
        
        // Create custom modal for pairing
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
        overlay.style.zIndex = '10000';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        
        const modal = document.createElement('div');
        modal.style.backgroundColor = 'var(--card, #2d3748)';
        modal.style.color = 'var(--text, #fff)';
        modal.style.padding = '20px';
        modal.style.borderRadius = '10px';
        modal.style.maxWidth = '500px';
        modal.style.width = '90%';
        modal.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.gap = '15px';
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const showPinEntry = () => {
            modal.innerHTML = `
                <h3 style="margin:0 0 10px 0;">PS5 Pairing - PIN Required</h3>
                <p style="font-size:0.9em; opacity:0.8;">Please enter the PIN displayed on your PS5 screen.</p>
                <p style="font-size:0.8em; opacity:0.6;">Go to Settings > System > Remote Play > Link Device</p>
                
                <input type="text" placeholder="00000000" id="ps5-pin-input" style="width:100%; padding:12px; font-size:1.2em; text-align:center; letter-spacing:5px; border-radius:4px; border:1px solid #555; background:#1a202c; color:#fff;">
                
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                    <button id="btn-cancel-pin" style="padding:8px 16px; cursor:pointer; background:transparent; color:#aaa; border:1px solid #555; border-radius:4px;">Cancel</button>
                    <button id="btn-submit-pin" style="padding:8px 16px; cursor:pointer; background:#48bb78; color:white; border:none; border-radius:4px;">Submit PIN</button>
                </div>
            `;

            document.getElementById('btn-cancel-pin').onclick = () => {
                document.body.removeChild(overlay);
            };

            document.getElementById('btn-submit-pin').onclick = () => {
                const pin = document.getElementById('ps5-pin-input').value.trim();
                if (!pin) return;

                modal.innerHTML = `<h3 style="text-align:center;">Submitting PIN...</h3>`;
                
                fetch('/api/ps5/pin-submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin })
                })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        modal.innerHTML = `<h3 style="text-align:center; color:#48bb78;">Pairing Successful!</h3>`;
                        setTimeout(() => document.body.removeChild(overlay), 2000);
                    } else {
                        alert('Pairing failed: ' + d.error);
                        document.body.removeChild(overlay);
                    }
                });
            };
        };

        const pollForPin = () => {
            modal.innerHTML = `
                <h3 style="margin:0 0 10px 0;">PS5 Pairing</h3>
                <div style="text-align:center; padding:20px;">
                    <p>Waiting for PS5 to request PIN...</p>
                    <div class="spinner" style="margin:10px auto; width:30px; height:30px; border:3px solid rgba(255,255,255,0.3); border-radius:50%; border-top-color:#fff; animation:spin 1s ease-in-out infinite;"></div>
                </div>
            `;
            
            const pollInterval = setInterval(() => {
                fetch('/api/ps5/pair-status')
                    .then(r => r.json())
                    .then(statusData => {
                        if (statusData.status === 'pin_required') {
                            clearInterval(pollInterval);
                            showPinEntry();
                        } else if (statusData.status === 'error') {
                            clearInterval(pollInterval);
                            alert('Pairing failed: ' + statusData.error);
                            document.body.removeChild(overlay);
                        } else if (statusData.status === 'success') {
                            clearInterval(pollInterval);
                            alert('Pairing successful!');
                            document.body.removeChild(overlay);
                        }
                    });
            }, 2000);
        };

        fetch(`/api/ps5/${id}/pair`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'pin_required') {
                    showPinEntry();
                } else if (data.status === 'auth_required') {
                    const url = data.url;
                    
                    modal.innerHTML = `
                        <h3 style="margin:0 0 10px 0;">PS5 Pairing</h3>
                        <p style="font-size:0.9em; opacity:0.8;">1. Visit the login page below and sign in to PSN.</p>
                        <div style="display:flex; gap:10px;">
                            <input type="text" value="${url}" readonly style="flex:1; padding:8px; border-radius:4px; border:1px solid #555; background:#1a202c; color:#fff;" id="ps5-auth-url">
                            <button id="btn-copy-url" style="padding:8px 12px; cursor:pointer; background:#4a5568; color:white; border:none; border-radius:4px;">Copy</button>
                            <a href="${url}" target="_blank" style="padding:8px 12px; cursor:pointer; background:#3182ce; color:white; text-decoration:none; border-radius:4px; display:flex; align-items:center;">Open</a>
                        </div>
                        
                        <p style="font-size:0.9em; opacity:0.8; margin-top:10px;">2. After logging in, you will see a "redirect" error page. Copy the FULL URL from your browser address bar and paste it here:</p>
                        <input type="text" placeholder="Paste redirect URL here..." id="ps5-redirect-url" style="width:100%; padding:8px; border-radius:4px; border:1px solid #555; background:#1a202c; color:#fff;">
                        
                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                            <button id="btn-cancel-pair" style="padding:8px 16px; cursor:pointer; background:transparent; color:#aaa; border:1px solid #555; border-radius:4px;">Cancel</button>
                            <button id="btn-submit-pair" style="padding:8px 16px; cursor:pointer; background:#48bb78; color:white; border:none; border-radius:4px;">Submit</button>
                        </div>
                    `;
                    
                    // Event Listeners
                    document.getElementById('btn-copy-url').onclick = () => {
                        const copyText = document.getElementById("ps5-auth-url");
                        copyText.select();
                        copyText.setSelectionRange(0, 99999); 
                        navigator.clipboard.writeText(copyText.value);
                        document.getElementById('btn-copy-url').textContent = 'Copied!';
                        setTimeout(() => document.getElementById('btn-copy-url').textContent = 'Copy', 2000);
                    };
                    
                    document.getElementById('btn-cancel-pair').onclick = () => {
                        document.body.removeChild(overlay);
                    };
                    
                    document.getElementById('btn-submit-pair').onclick = () => {
                        const redirectUrl = document.getElementById('ps5-redirect-url').value.trim();
                        if (!redirectUrl) {
                            alert('Please paste the redirect URL.');
                            return;
                        }
                        
                        fetch('/api/ps5/pair-submit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: redirectUrl })
                        })
                        .then(r => r.json())
                        .then(d => {
                            if (d.success) {
                                pollForPin();
                            }
                            else alert('Pairing failed: ' + d.error);
                        });
                    };

                } else {
                    pollForPin();
                }
            });
    };

    // Initial fetch
    fetchDevices();
    setInterval(fetchDevices, 3000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('Tab became visible, refreshing devices...');
            fetchDevices();
        }
    });

    // Keyboard Control for Camera (Arrow Keys)
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('deviceModal');
        // Only if modal is open
        if (!modal || modal.style.display !== 'block') return;
        
        const deviceId = modal.dataset.deviceId;
        if (!deviceId) return;
        
        // Find device to check if it is a camera
        const device = allDevices.find(d => d.id === deviceId);
        if (!device || device.type !== 'camera') return;

        // Map keys to commands
        let cmd = null;
        if (e.key === 'ArrowUp') cmd = 'nudge_up';
        else if (e.key === 'ArrowDown') cmd = 'nudge_down';
        else if (e.key === 'ArrowLeft') cmd = 'nudge_left';
        else if (e.key === 'ArrowRight') cmd = 'nudge_right';
        else if (e.key === 'Home') cmd = 'ptz_home';

        if (cmd) {
            e.preventDefault(); // Prevent scrolling
            controlDevice(deviceId, cmd);
        }
    });

    // --- WebSocket for Real-time Events (Pairing) ---
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pairing-required') {
                // Use the global showPairingModal
                if (window.showPairingModal) {
                    window.showPairingModal(msg.ip, msg.name, 'tv');
                }
            }
        } catch (e) {
            console.error('WebSocket error:', e);
        }
    };
});

// Global functions for PS5 Games
window.showPS5Games = async function(deviceId) {
    const modal = document.getElementById('deviceModal');
    modal.dataset.isSubView = 'true'; // Prevent auto-refresh from overwriting this view
    
    const modalBody = document.getElementById('modalDeviceBody');
    modalBody.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading games...</p></div>';

    try {
        const res = await fetch('/api/psn/games');
        if (!res.ok) {
            const err = await res.json();
            if (err.error && (err.error.includes('Not authenticated') || err.error.includes('401'))) {
                modalBody.innerHTML = `
                    <div style="text-align: center; padding: 20px;">
                        <h3>PSN Login Required</h3>
                        <p>Please enter your NPSSO token to access your game library.</p>
                        <p><small><a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank">Get NPSSO Token</a> (Login required)</small></p>
                        <input type="text" id="npssoToken" placeholder="NPSSO Token" style="width: 100%; padding: 10px; margin: 10px 0; background: #333; color: white; border: 1px solid #555; border-radius: 5px;">
                        <button class="btn btn-primary" onclick="authenticatePSN('${deviceId}')">Login</button>
                        <button class="btn btn-secondary" style="margin-top: 10px;" onclick="closeSubView('${deviceId}')">Cancel</button>
                    </div>
                `;
                return;
            }
            throw new Error(err.error || 'Failed to fetch games');
        }

        const games = await res.json();
        if (games.length === 0) {
            modalBody.innerHTML = '<p style="text-align:center; padding: 20px;">No games found.</p>';
            return;
        }

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 15px; padding: 10px;">';
        games.forEach(game => {
            html += `
                <div class="game-card" style="background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; cursor: pointer; transition: transform 0.2s;" 
                     onclick="launchPS5Game('${deviceId}', '${game.titleId}', '${game.name}')"
                     onmouseover="this.style.transform='scale(1.05)'" 
                     onmouseout="this.style.transform='scale(1)'">
                    <img src="${game.imageUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                    <div style="padding: 8px;">
                        <div style="font-weight: bold; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${game.name}</div>
                        <div style="font-size: 0.8em; color: #aaa;">${game.platform}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        // Add back button
        html = `
            <button class="btn btn-secondary" style="margin-bottom: 10px;" onclick="closeSubView('${deviceId}')">
                <i class="fas fa-arrow-left"></i> Back
            </button>
            ${html}
        `;

        modalBody.innerHTML = html;

    } catch (e) {
        modalBody.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">Error: ${e.message}</div>`;
    }
};

window.closeSubView = function(deviceId) {
    const modal = document.getElementById('deviceModal');
    delete modal.dataset.isSubView; // Re-enable auto-refresh
    
    // Manually trigger a refresh of the main view
    const device = allDevices.find(d => d.id === deviceId);
    if (device) {
        // We need to call the internal updateModalContent, but it's not exposed globally.
        // However, we can just trigger a fetchDevices which will update it.
        // Or better, we can just close and reopen if we can't access updateModalContent.
        // Actually, updateModalContent IS defined inside the closure but not exposed.
        // Let's expose it or just rely on the next poll.
        // Wait, we can just close the modal for now, or better yet, expose updateModalContent.
        // Since we can't easily expose it without rewriting a lot, let's just force a re-render by calling fetchDevices immediately.
        // But fetchDevices is async.
        // Let's just close the modal and let the user reopen it, OR we can try to find the device in allDevices and re-render the HTML manually.
        // Actually, we can just set the innerHTML to "Loading..." and wait for the next poll (5s).
        // A better UX is to just close the modal.
        // closeDeviceDetail();
        // Even better: let's just reload the page content if we can.
        // Let's try to trigger a refresh.
        
        // Since we are inside the module scope, we can't call updateModalContent.
        // But we can just close the modal.
        closeDeviceDetail();
        openDeviceDetail(deviceId); // This is global
    } else {
        closeDeviceDetail();
    }
};

window.authenticatePSN = async function(deviceId) {
    const npsso = document.getElementById('npssoToken').value;
    if (!npsso) return alert('Please enter NPSSO token');

    try {
        const res = await fetch('/api/psn/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ npsso })
        });
        const data = await res.json();
        if (data.success) {
            showPS5Games(deviceId);
        } else {
            alert('Authentication failed: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

// --- Generic Pairing Logic ---
let currentPairingDevice = null;

window.unpairDevice = async (deviceId) => {
    if (!confirm('Weet je zeker dat je de inloggegevens wilt verwijderen?')) return;
    
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) {
        alert('Apparaat niet gevonden');
        return;
    }
    
    try {
        const res = await fetch('/api/devices/unpair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: device.ip })
        });
        const data = await res.json();
        if (data.ok) {
            alert('Gegevens verwijderd');
            fetchDevices(); // Refresh list
            closeDeviceDetail();
        } else {
            alert('Fout bij verwijderen: ' + data.error);
        }
    } catch (e) {
        alert('Netwerkfout: ' + e.message);
    }
};

window.showPairingModal = (arg1, arg2) => {
    try {
        let device = allDevices.find(d => d.id === arg1);
        
        if (device) {
            currentPairingDevice = { ip: device.ip, name: device.name, type: device.type };
        } else {
            // Fallback: Check if arg1 is an IP or if arg2 is provided (legacy call)
            if (arg1 && arg1.includes('.')) {
                 currentPairingDevice = { ip: arg1, name: arg2 || 'Device', type: 'unknown' };
            } else {
                 console.error('Device not found for pairing and invalid IP:', arg1);
                 // Try to find by IP if arg1 happens to be an IP but didn't match ID
                 const devByIp = allDevices.find(d => d.ip === arg1);
                 if (devByIp) {
                     currentPairingDevice = { ip: devByIp.ip, name: devByIp.name, type: devByIp.type };
                 } else {
                     alert('Apparaat niet gevonden: ' + arg1);
                     return;
                 }
            }
        }

        const { ip, name, type } = currentPairingDevice;

        console.log('showPairingModal called for:', arg1, ip, name, type);
        const modal = document.getElementById('pairingModal');
        if (!modal) {
            alert('Pairing modal element not found!');
            return;
        }
        const title = document.getElementById('pairingTitle');
        const desc = document.getElementById('pairingDesc');
        
        title.textContent = `Koppelen met ${name}`;
        desc.textContent = `Voer gegevens in voor ${type ? type.toUpperCase() : 'apparaat'} (${ip})`;
        
        document.getElementById('pair-username').value = '';
        document.getElementById('pair-password').value = '';
        document.getElementById('pair-pin').value = '';
        
        // Toggle fields based on type
        const userGroup = document.getElementById('pair-username').closest('.control-group');
        const passGroup = document.getElementById('pair-password').closest('.control-group');
        const pinGroup = document.getElementById('pair-pin-group');
        
        if (type === 'tv' || type === 'samsung' || type === 'lg') {
            if (userGroup) userGroup.style.display = 'none';
            if (passGroup) passGroup.style.display = 'none';
            if (pinGroup) pinGroup.style.display = 'block';
            desc.textContent = `Voer de PIN code in die op ${name || 'je TV'} verschijnt:`;
        } else {
            if (userGroup) userGroup.style.display = 'block';
            if (passGroup) passGroup.style.display = 'block';
            if (pinGroup) pinGroup.style.display = 'none';
        }
        
        modal.style.display = 'flex';
        
        if (type === 'tv' || type === 'samsung' || type === 'lg') {
            const pinInput = document.getElementById('pair-pin');
            if (pinInput) pinInput.focus();
        } else {
            const userInput = document.getElementById('pair-username');
            if (userInput) userInput.focus();
        }
    } catch (e) {
        console.error('Error in showPairingModal:', e);
        alert('Error opening pairing modal: ' + e.message);
    }
};


window.submitPairing = async () => {
    console.log('submitPairing called for:', currentPairingDevice);
    if (!currentPairingDevice) return;
    
    const username = document.getElementById('pair-username').value;
    const password = document.getElementById('pair-password').value;
    const pin = document.getElementById('pair-pin').value;
    
    const btn = document.querySelector('#pairingModal .btn-primary');
    const originalText = btn.textContent;
    btn.textContent = 'Verbinden...';
    btn.disabled = true;
    
    try {
        let res;
        if (currentPairingDevice.type === 'tv' || currentPairingDevice.type === 'samsung' || currentPairingDevice.type === 'lg') {
             const device = allDevices.find(d => d.ip === currentPairingDevice.ip);
             if (device) {
                 res = await fetch(`/api/devices/${device.id}/command`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ command: 'pair', value: pin })
                 });
             } else {
                 throw new Error('Apparaat niet gevonden in lijst.');
             }
        } else {
            res = await fetch('/api/devices/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: currentPairingDevice.ip,
                    type: currentPairingDevice.type,
                    username,
                    password,
                    pin
                })
            });
        }
        
        const data = await res.json();
        if (data.ok) {
            alert('Succesvol gekoppeld!');
            document.getElementById('pairingModal').style.display = 'none';
            if (typeof fetchDevices === 'function') fetchDevices();
        } else {
            alert('Koppelen mislukt: ' + (data.error || 'Onbekende fout'));
        }
    } catch (e) {
        alert('Netwerkfout: ' + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};

window.launchPS5Game = async function(deviceId, titleId, name) {
    if (!confirm(`Launch ${name} on PS5?`)) return;
    
    try {
        const res = await fetch(`/api/ps5/${deviceId}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titleId })
        });
        const data = await res.json();
        if (data.success) {
            alert(`Launched ${name}!`);
            closeDeviceDetail();
        } else {
            // Show a more helpful error message if it's the known limitation
            if (data.error && data.error.includes('Remote Play only')) {
                alert(`Cannot launch ${name}. The current PS5 control library only supports Remote Play, which cannot launch specific games. You can still use the remote control buttons.`);
            } else {
                alert('Failed to launch: ' + (data.error || 'Unknown error'));
            }
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

