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

        fetch('/api/camera/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, rtspUrl })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = ''; // Clear placeholder
                    const video = document.createElement('video');
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.borderRadius = '10px';
                    video.autoplay = true;
                    video.muted = true;
                    video.playsInline = true;
                    container.appendChild(video);

                    const pc = new RTCPeerConnection({
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    });

                    pc.addTransceiver('video', { direction: 'recvonly' });

                    pc.ontrack = (event) => {
                        console.log('WebRTC Track received:', event.streams[0]);
                        video.srcObject = event.streams[0];
                        // Force play just in case
                        video.play().catch(e => console.error('Auto-play failed:', e));
                    };

                    // Add connection state logging
                    pc.onconnectionstatechange = () => {
                        console.log('WebRTC Connection State:', pc.connectionState);
                        if (pc.connectionState === 'failed') {
                            pc.close();
                        }
                    };

                    pc.createOffer().then(offer => {
                        return pc.setLocalDescription(offer);
                    }).then(() => {
                        return fetch('/api/camera/webrtc/offer', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                deviceId: deviceId,
                                rtspUrl: rtspUrl,
                                sdp: pc.localDescription.sdp
                            })
                        });
                    }).then(res => res.json())
                    .then(data => {
                        return pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
                    })
                    .catch(e => console.error('WebRTC Error:', e));

                    activeStreams.set(deviceId, { 
                        destroy: () => { 
                            pc.close(); 
                            video.srcObject = null; 
                            activeStreams.delete(deviceId);
                        } 
                    });
                }
            } else {
                 console.error('Stream start failed', data);
                 const container = document.getElementById(containerId);
                 if (container) {
                     container.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #333;">
                            <p style="color: #dc3545; margin-bottom: 10px;">Verbinding mislukt</p>
                            <button id="btn-retry-${deviceId}" style="padding: 5px 15px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">Opnieuw inloggen</button>
                        </div>
                     `;
                     const retryBtn = document.getElementById(`btn-retry-${deviceId}`);
                     if(retryBtn) {
                        retryBtn.onclick = () => {
                            localStorage.removeItem(`camera_creds_${deviceId}`);
                            startCameraStream(deviceId, ip, containerId);
                        };
                     }
                 }
            }
        })
        .catch(err => console.error('Error starting stream:', err));
    }

    function fetchDevices() {
        fetch('/api/devices')
            .then(res => res.json())
            .then(devices => {
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
            else if (type === 'nas') icon = 'fa-server';

            const isOn = device.state.on;
            const statusClass = isOn ? 'on' : 'off';

            if (!card) {
                card = document.createElement('div');
                card.className = 'device-card';
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

        let controlsHtml = '';

        // Power Button (except for sensors/locks/cameras)
        if (type !== 'sensor' && type !== 'lock' && type !== 'camera') {
            controlsHtml += `
                <button class="big-power-btn ${isOn ? 'on' : ''}" onclick="toggleDevice('${device.id}')">
                    <i class="fas fa-power-off"></i>
                </button>
            `;
        }

        // Specific Controls
        if (type === 'light' && isOn) {
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
    }    window.togglePiP = async (deviceId) => {
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

    // Initial fetch
    fetchDevices();
    setInterval(fetchDevices, 3000);

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
});
