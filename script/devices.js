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
                    <div id="modalDeviceBody" class="device-modal-body">
                        <!-- Dynamic Content -->
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Close on outside click
        window.onclick = function(event) {
            const modal = document.getElementById('deviceModal');
            if (event.target == modal) {
                closeDeviceDetail();
            }
        }
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

    let allDevices = []; // Store devices globally for modal access
    const activeStreams = new Map(); // deviceId -> JSMpeg player

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
                    btn.onclick = () => {
                        const user = document.getElementById(`cam-user-${deviceId}`).value;
                        const pass = document.getElementById(`cam-pass-${deviceId}`).value;
                        if (user && pass) {
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
                    if (openId) {
                        const device = devices.find(d => d.id === openId);
                        if (device) updateModalContent(device);
                    }
                }
            })
            .catch(err => console.error('Error fetching devices:', err));
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
        
        // Re-render
        renderDevices(allDevices);

        // If modal is open for this device, update it
        const modal = document.getElementById('deviceModal');
        if (modal.style.display === 'block' && modal.dataset.deviceId === updatedDevice.id) {
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
            let card = document.getElementById(`device-card-${device.id}`);
            
            // Determine Icon
            let icon = 'fa-question-circle';
            const type = device.type.toLowerCase();
            if (type === 'light' || type.includes('bulb')) icon = 'fa-lightbulb';
            else if (type === 'switch' || type.includes('outlet')) icon = 'fa-plug';
            else if (type === 'tv') icon = 'fa-tv';
            else if (type === 'speaker') icon = 'fa-music';
            else if (type === 'camera') icon = 'fa-video';
            else if (type === 'printer') icon = 'fa-print';
            else if (type === 'thermostat' || type === 'ac') icon = 'fa-thermometer-half';
            else if (type === 'lock') icon = 'fa-lock';
            else if (type === 'cover' || type === 'blind') icon = 'fa-warehouse'; // or fa-blinds if available
            else if (type === 'vacuum') icon = 'fa-robot';
            else if (type === 'sensor') icon = 'fa-wifi';
            else if (type === 'console' || type === 'playstation') icon = 'fa-gamepad';
            else if (type === 'nas') icon = 'fa-server';

            const isOn = device.state.on;
            const statusClass = isOn ? 'on' : 'off';

            if (!card) {
                card = document.createElement('div');
                card.className = `device-card ${isOn ? 'active' : ''}`;
                card.id = `device-card-${device.id}`;
                // Add click handler to open modal
                card.onclick = (e) => {
                    // Prevent opening if clicking a button directly
                    if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT') return;
                    openDeviceDetail(device.id);
                };
                grid.appendChild(card);
            } else {
                // Update active class on existing card
                if (isOn) card.classList.add('active');
                else card.classList.remove('active');
            }

            // Simple Card Content (Summary)
            let summary = '';
            if (isOn) {
                if (type === 'light') summary = `${device.state.brightness || 100}%`;
                else if (type === 'thermostat') summary = `${device.state.temperature}°C`;
                else if (type === 'sensor') summary = `${device.state.temperature}°C`;
                else if (type === 'lock') summary = device.state.isLocked ? 'Locked' : 'Unlocked';
                else if ((type === 'tv' || type === 'speaker' || type === 'receiver') && device.state.mediaTitle) {
                    summary = `<span style="font-size: 0.9em; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${device.state.mediaTitle}</span>`;
                    if (device.state.mediaArtist) {
                        summary += `<span style="font-size: 0.8em; color: #aaa; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${device.state.mediaArtist}</span>`;
                    }
                }
                else summary = 'Aan';
            } else {
                summary = 'Uit';
            }

            card.innerHTML = `
                <div class="device-header">
                    <div class="device-icon ${statusClass}"><i class="fas ${icon}"></i></div>
                    <div class="device-info">
                        <h3>${device.name}</h3>
                        <p class="device-ip">${summary}</p>
                    </div>
                    <button class="device-menu-btn" onclick="showDeviceMenu('${device.id}', event); event.stopPropagation();" title="Meer opties">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}'); event.stopPropagation();">
                        <i class="fas fa-power-off"></i>
                    </button>
                </div>
            `;
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
        
        updateModalContent(device);
        
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

    function updateModalContent(device) {
        const modalContent = document.querySelector('.device-modal-content');
        const body = document.getElementById('modalDeviceBody');
        const type = device.type.toLowerCase();
        const isOn = device.state.on;
        
        // Check for media capability
        const isMedia = (type === 'tv' || type === 'speaker' || type === 'receiver' || 
                        device.protocol === 'mdns-airplay' || device.protocol === 'spotify-connect' ||
                        device.name.toLowerCase().includes('denon')) && isOn;
        const isCamera = type === 'camera';

        // Avoid full refresh for camera if stream is active OR if login form is present
        if (isCamera) {
             // Check if stream is active
             if (activeStreams.has(device.id)) {
                 const leftCol = document.querySelector('.modal-left-col');
                 if (leftCol) {
                     const iconEl = leftCol.querySelector('.modal-device-icon');
                     if (iconEl) {
                         if (isOn) iconEl.classList.add('on');
                         else iconEl.classList.remove('on');
                     }

                    // --- Device context menu ---
                    window.showDeviceMenu = (deviceId, ev) => {
                        // remove existing menu
                        const existing = document.getElementById('device-context-menu');
                        if (existing) existing.remove();

                        const device = allDevices.find(d => d.id === deviceId);
                        if (!device) return;

                        const menu = document.createElement('div');
                        menu.id = 'device-context-menu';
                        menu.style.position = 'absolute';
                        menu.style.zIndex = 20000;
                        menu.style.minWidth = '180px';
                        menu.style.background = 'var(--card)';
                        menu.style.color = 'var(--text)';
                        menu.style.border = '1px solid var(--border)';
                        menu.style.borderRadius = '8px';
                        menu.style.boxShadow = '0 10px 30px rgba(2,6,23,0.6)';
                        menu.style.padding = '6px';

                        const actions = [
                            { label: 'Details', cb: () => openDeviceDetail(deviceId) },
                            { label: device.state.on ? 'Uitzetten' : 'Aanzetten', cb: () => toggleDevice(deviceId) },
                            { label: 'Hernoemen', cb: async () => {
                                const name = prompt('Nieuwe naam:', device.name);
                                if (name && name.trim() && name !== device.name) {
                                    await fetch(`/api/devices/${deviceId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
                                    fetchDevices();
                                }
                            }},
                            { label: 'Verplaatsen naar kamer', cb: async () => {
                                if (typeof window.showRoomPicker === 'function') {
                                    const roomId = await window.showRoomPicker({ deviceId });
                                    if (roomId) { await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId }) }); fetchDevices(); }
                                } else {
                                    alert('Room picker niet beschikbaar');
                                }
                            }}
                        ];

                        actions.forEach(a => {
                            const item = document.createElement('button');
                            item.className = 'context-item';
                            item.textContent = a.label;
                            item.style.display = 'block';
                            item.style.width = '100%';
                            item.style.padding = '8px 10px';
                            item.style.border = 'none';
                            item.style.background = 'transparent';
                            item.style.textAlign = 'left';
                            item.style.cursor = 'pointer';
                            item.style.borderRadius = '6px';
                            item.onmouseover = () => item.style.background = 'rgba(255,255,255,0.02)';
                            item.onmouseout = () => item.style.background = 'transparent';
                            item.onclick = (e) => { e.stopPropagation(); a.cb(); menu.remove(); };
                            menu.appendChild(item);
                        });

                        document.body.appendChild(menu);

                        // position it near event
                        const x = ev.pageX || (ev.clientX + window.scrollX);
                        const y = ev.pageY || (ev.clientY + window.scrollY);
                        menu.style.left = (x + 6) + 'px';
                        menu.style.top = (y + 6) + 'px';

                        // click outside to close
                        const closer = (evt) => {
                            if (!menu.contains(evt.target)) { menu.remove(); window.removeEventListener('click', closer); }
                        };
                        setTimeout(() => window.addEventListener('click', closer), 0);
                    };
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
            body.classList.add('split-view');
            // Ensure camera container has a high z-index context
            if (isCamera) {
                body.style.position = 'relative';
                body.style.zIndex = '5';
            }
        } else {
            modalContent.classList.remove('wide');
            body.classList.remove('split-view');
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

        let controlsHtml = '';

        // Power Button (except for sensors/locks/cameras)
        if (type !== 'sensor' && type !== 'lock' && type !== 'camera') {
            // For PS5, use specific commands 'wake' and 'standby'
            // For others, use 'toggle' or 'turn_on'/'turn_off'
            let cmd = 'toggle';
            if (type === 'ps5' || type === 'console') {
                cmd = isOn ? 'standby' : 'wake';
            }
            
            controlsHtml += `
                <button class="big-power-btn ${isOn ? 'on' : ''}" onclick="controlDevice('${device.id}', '${cmd}')">
                    <i class="fas fa-power-off"></i>
                </button>
            `;
        }

        // Specific Controls
        if (type === 'ps5' || type === 'console') {
             controlsHtml += `
                <div class="remote-control">
                    <div class="d-pad">
                        <button class="d-btn up" onclick="controlDevice('${device.id}', 'up')"><i class="fas fa-chevron-up"></i></button>
                        <button class="d-btn left" onclick="controlDevice('${device.id}', 'left')"><i class="fas fa-chevron-left"></i></button>
                        <button class="d-btn center" onclick="controlDevice('${device.id}', 'enter')">OK</button>
                        <button class="d-btn right" onclick="controlDevice('${device.id}', 'right')"><i class="fas fa-chevron-right"></i></button>
                        <button class="d-btn down" onclick="controlDevice('${device.id}', 'down')"><i class="fas fa-chevron-down"></i></button>
                    </div>
                    <div class="remote-actions">
                        <button class="action-btn" onclick="controlDevice('${device.id}', 'back')"><i class="fas fa-arrow-left"></i> Back</button>
                        <button class="action-btn" onclick="controlDevice('${device.id}', 'home')"><i class="fas fa-home"></i> Home</button>
                        <button class="action-btn" onclick="controlDevice('${device.id}', 'options')"><i class="fas fa-bars"></i> Options</button>
                    </div>
                    <div style="margin-top: 20px; width: 100%; display: flex; justify-content: center;">
                        <button class="action-btn" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);" onclick="startPS5Pairing('${device.id}')">
                            <i class="fas fa-link"></i> Pair PS5
                        </button>
                    </div>
                </div>
            `;
        } else if (type === 'light' && isOn) {
            controlsHtml += `
                <div class="modal-slider-container">
                    <label class="modal-slider-label">Helderheid: ${device.state.brightness || 0}%</label>
                    <input type="range" class="modal-slider" min="0" max="100" value="${device.state.brightness || 0}"
                        onchange="controlDevice('${device.id}', 'set_brightness', this.value)">
                </div>
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
        } else if (type === 'console' || type === 'playstation' || device.name.toLowerCase().includes('ps5')) {
            controlsHtml += `
                <div style="display: flex; flex-direction: column; gap: 15px; align-items: center; margin-top: 20px;">
                    <p>PlayStation 5 Control</p>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" style="padding: 15px 30px; font-size: 1.2em;" onclick="controlPS5('${device.id}', 'wake')">
                            <i class="fas fa-power-off"></i> Wake
                        </button>
                        <button class="btn btn-secondary" style="padding: 15px 30px; font-size: 1.2em; background-color: #dc3545; color: white;" onclick="controlPS5('${device.id}', 'standby')">
                            <i class="fas fa-moon"></i> Standby
                        </button>
                    </div>
                    <button class="btn btn-secondary" style="margin-top: 10px;" onclick="startPS5Pairing('${device.id}')">
                        <i class="fas fa-link"></i> Pair / Login
                    </button>
                </div>
            `;
        } else if (type === 'nas') {
            controlsHtml += `
                <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin-top: 20px;">
                    <p>Beheer je NAS verbindingen en bestanden.</p>
                    <button class="btn btn-primary" style="width: 100%; padding: 12px;" onclick="window.location.href='settings.html'">
                        <i class="fas fa-cog"></i> Verbinden / Instellen
                    </button>
                    <button class="btn btn-secondary" style="width: 100%; padding: 12px; background-color: #6c757d; color: white; border: none; border-radius: 5px;" onclick="window.location.href='files.html'">
                        <i class="fas fa-folder-open"></i> Bestanden Bladeren
                    </button>
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
            `;
        }

        // Add Pairing Button for Android TV / Google TV
        // Show for explicit protocol OR generic TVs that aren't other known brands
        const isOtherTv = device.type === 'tv' && 
                          !device.protocol.includes('samsung') && 
                          !device.protocol.includes('webos') && 
                          !device.protocol.includes('airplay') &&
                          !device.name.toLowerCase().includes('samsung') &&
                          !device.name.toLowerCase().includes('lg') &&
                          !device.name.toLowerCase().includes('apple');

        if (device.protocol === 'mdns-googlecast' || isOtherTv) {
             controlsHtml += `
                <div class="control-group" style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 20px;">
                    <button class="btn-secondary" style="width: 100%; padding: 12px;" onclick="startPairing('${device.ip}', '${device.name}')">
                        <i class="fas fa-link"></i> Handmatig Koppelen
                    </button>
                </div>
             `;
        }

        if (isMedia) {
            const title = device.state.mediaTitle || 'Geen media';
            const artist = device.state.mediaArtist || '';
            const album = device.state.mediaAlbum || '';
            const app = device.state.mediaApp || '';
            const state = device.state.playingState || 'stopped';
            
            // Placeholder art
            let artContent = `<i class="fas fa-music"></i>`;
            
            // If we have a way to get artwork URL, we would use it here.
            // For now, we can check if there is a global spotify state that matches this device
            // But that's complex to access here synchronously without storing it.
            // We'll stick to the icon for now, or maybe a generic image based on app.
            
            if (app.toLowerCase().includes('spotify')) {
                artContent = `<i class="fab fa-spotify" style="color: #1db954;"></i>`;
            } else if (app.toLowerCase().includes('netflix')) {
                artContent = `<span style="color: #e50914; font-weight: bold; font-size: 0.5em;">NETFLIX</span>`;
            } else if (app.toLowerCase().includes('youtube')) {
                artContent = `<i class="fab fa-youtube" style="color: #ff0000;"></i>`;
            }

            body.innerHTML = `
                <div class="modal-left-col">
                    <i class="fas ${icon} modal-device-icon ${isOn ? 'on' : ''}"></i>
                    ${controlsHtml}
                </div>
                <div class="modal-right-col">
                    <div class="media-info-panel">
                        <div class="album-art">
                            ${artContent}
                        </div>
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
            `;
        } else if (isCamera) {
            body.innerHTML = `
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
            `;
            
            startCameraStream(device.id, device.ip, `camera-container-${device.id}`);
        } else {
            body.innerHTML = `
                <i class="fas ${icon} modal-device-icon ${isOn ? 'on' : ''}"></i>
                ${controlsHtml}
            `;
        }
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
        const endpoint = action === 'wake' ? 'wake' : 'standby';
        fetch(`/api/ps5/${id}/${endpoint}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // alert(`PS5 ${action} command sent.`);
                } else {
                    alert(`Error: ${data.error}`);
                }
            })
            .catch(err => console.error('PS5 Control Error:', err));
    };

    window.startPS5Pairing = (id) => {
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
                showPairingModal(msg.ip, msg.name);
            }
        } catch (e) {
            console.error('WebSocket error:', e);
        }
    };

    // --- Pairing Modal Logic ---
    const pairingModal = document.getElementById('pairingModal');
    const pairingPinInput = document.getElementById('pairingPin');
    const pairingIpInput = document.getElementById('pairingIp');
    const submitPairingBtn = document.getElementById('submitPairing');
    const closePairingModal = pairingModal ? pairingModal.querySelector('.close-modal') : null;

    function showPairingModal(ip, name) {
        if (!pairingModal) return;
        pairingIpInput.value = ip;
        document.getElementById('pairingMessage').textContent = `Voer de PIN code in die op ${name || 'je TV'} verschijnt:`;
        pairingModal.style.display = 'block';
        pairingPinInput.focus();
    }

    if (closePairingModal) {
        closePairingModal.onclick = () => {
            pairingModal.style.display = 'none';
        };
    }

    if (submitPairingBtn) {
        submitPairingBtn.onclick = () => {
            const pin = pairingPinInput.value;
            const ip = pairingIpInput.value;
            
            // Find device ID by IP
            const device = allDevices.find(d => d.ip === ip);
            if (!device) {
                alert('Apparaat niet gevonden. Wacht tot het in de lijst verschijnt.');
                return;
            }

            fetch(`/api/devices/${device.id}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'pair', value: pin })
            })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    pairingModal.style.display = 'none';
                    pairingPinInput.value = '';
                    alert('Koppelen gestart...');
                } else {
                    alert('Fout bij koppelen: ' + data.error);
                }
            });
        };
    }
});
