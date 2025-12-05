document.addEventListener('DOMContentLoaded', () => {
    const devicesContainer = document.querySelector('.content-area');
    
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

    function fetchDevices() {
        fetch('/api/devices')
            .then(res => res.json())
            .then(devices => {
                renderDevices(devices);
            })
            .catch(err => console.error('Error fetching devices:', err));
    }

    function renderDevices(devices) {
        // console.log('Rendering devices:', devices); // Debug log
        
        if (devices.length === 0) {
            grid.innerHTML = '<div class="loading-devices"><i class="fas fa-spinner fa-spin"></i> Apparaten zoeken...</div>';
            return;
        }

        // Remove loading spinner if present
        if (grid.querySelector('.loading-devices')) {
            grid.innerHTML = '';
        }

        // Track current device IDs to remove stale cards
        const currentIds = new Set(devices.map(d => d.id));
        
        // Remove old cards
        const existingCards = grid.querySelectorAll('.device-card');
        existingCards.forEach(card => {
            const id = card.id.replace('device-card-', '');
            if (!currentIds.has(id)) {
                card.remove();
            }
        });

        devices.forEach(device => {
            try {
                let card = document.getElementById(`device-card-${device.id}`);
                let isNew = false;

                if (!card) {
                    card = document.createElement('div');
                    card.className = 'device-card';
                    card.id = `device-card-${device.id}`;
                    grid.appendChild(card);
                    isNew = true;
                }
                
                // If card exists, we only update specific elements to avoid flickering
                if (!isNew) {
                    // Update Icon Status
                    const iconDiv = card.querySelector('.device-icon');
                    if (iconDiv) {
                        const isOn = device.state.on;
                        iconDiv.className = `device-icon ${isOn ? 'on' : 'off'}`;
                    }

                    // Update Status Text
                    const statusText = card.querySelector('.status-text');
                    if (statusText) {
                        statusText.textContent = device.state.on ? 'Aan' : 'Uit';
                    }

                    // Update Toggle Button
                    const toggleBtn = card.querySelector('.btn-toggle');
                    if (toggleBtn) {
                        const isOn = device.state.on;
                        if (isOn) toggleBtn.classList.add('active');
                        else toggleBtn.classList.remove('active');
                    }

                    // Update Slider (only if not active)
                    const slider = card.querySelector('.device-slider');
                    if (slider && document.activeElement !== slider) {
                        slider.value = device.state.brightness || device.state.volume || 0;
                    }

                    // Update Brightness Text
                    const brightnessText = card.querySelector('.brightness-text');
                    if (brightnessText && device.type === 'light') {
                        brightnessText.textContent = `${device.state.brightness || 0}%`;
                    }

                    // Update Temp Display
                    const tempDisplay = card.querySelector('.temp-display');
                    if (tempDisplay) {
                        tempDisplay.textContent = `${device.state.temperature}°C`;
                    }

                    // Trigger media update if applicable
                    const isMediaPlayer = device.protocol === 'mdns-airplay' || 
                                          device.protocol === 'samsung-tizen' || 
                                          device.protocol === 'lg-webos' ||
                                          (device.name && device.name.toLowerCase().includes('mac'));
                    
                    if (isMediaPlayer) {
                        updateDeviceState(device.id);
                    }

                    return; // Skip full rebuild
                }

                // --- Full Build for New Cards ---
                
                let icon = 'fa-question-circle';
                let controls = '';
                let statusClass = '';

                if (device.type === 'light') {
                icon = 'fa-lightbulb';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                const brightness = device.state.brightness || 0;
                controls = `
                    <div class="control-group" style="flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <span class="status-text" style="font-weight: bold;">${isOn ? 'Aan' : 'Uit'}</span>
                            <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                                <i class="fas fa-power-off"></i>
                            </button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <i class="fas fa-sun" style="font-size: 0.8em;"></i>
                            <input type="range" class="device-slider" min="0" max="100" value="${brightness}" 
                                onchange="controlDevice('${device.id}', 'set_brightness', this.value)" style="flex-grow: 1;">
                            <span class="brightness-text" style="min-width: 35px; text-align: right;">${brightness}%</span>
                        </div>
                    </div>
                `;
            } else if (device.type === 'tv') {
                icon = 'fa-tv';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                
                // Input Selector (Only for real TVs, not Apple TV or Mac)
                let inputSelector = '';
                let mediaControls = '';
                const isAppleDevice = device.name.toLowerCase().includes('apple tv') || device.name.toLowerCase().includes('mac');
                
                if (!isAppleDevice) {
                    const inputs = ['TV', 'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4'];
                    let inputOptions = inputs.map(inp => `<option value="${inp.toLowerCase()}">${inp}</option>`).join('');
                    inputSelector = `
                        <div class="control-group">
                            <select class="input-selector" onchange="controlDevice('${device.id}', 'set_input', this.value)" style="margin-top: 5px; width: 100%; padding: 5px;">
                                <option value="" disabled selected>Bron selecteren</option>
                                ${inputOptions}
                            </select>
                        </div>
                    `;
                } else {
                    // Always show media controls for Apple devices
                    mediaControls = `
                        <div class="control-group" style="justify-content: center; gap: 15px; margin-top: 10px;">
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'previous', null)"><i class="fas fa-step-backward"></i></button>
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'play', null)"><i class="fas fa-play"></i></button>
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'pause', null)"><i class="fas fa-pause"></i></button>
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'next', null)"><i class="fas fa-step-forward"></i></button>
                        </div>
                    `;
                }

                controls = `
                    <div class="control-group">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                        <div class="channel-controls" style="margin-left: auto; display: flex; gap: 5px;">
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'channel_up', null)"><i class="fas fa-chevron-up"></i></button>
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'channel_down', null)"><i class="fas fa-chevron-down"></i></button>
                        </div>
                    </div>
                    <div class="control-group">
                        <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_down', null)"><i class="fas fa-minus"></i></button>
                        <i class="fas fa-volume-up" style="margin: 0 10px;"></i>
                        <input type="range" class="device-slider" min="0" max="100" value="${device.state.volume || 20}" 
                            onchange="controlDevice('${device.id}', 'set_volume', this.value)">
                        <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_up', null)"><i class="fas fa-plus"></i></button>
                    </div>
                    ${mediaControls}
                    ${inputSelector}
                `;
            } else if (device.type === 'thermostat') {
                icon = 'fa-thermometer-half';
                statusClass = 'on';
                controls = `
                    <div class="control-group">
                        <span class="temp-display">${device.state.temperature}°C</span>
                        <input type="number" class="temp-input" value="${device.state.target}" 
                            onchange="controlDevice('${device.id}', 'set_target_temp', this.value)">
                    </div>
                `;
            } else if (device.type === 'sensor') {
                icon = 'fa-temperature-low';
                statusClass = 'on';
                controls = `
                    <div class="control-group" style="justify-content: space-around;">
                        <div style="text-align: center;">
                            <i class="fas fa-thermometer-half" style="color: #ff6b6b;"></i>
                            <span class="temp-display" style="font-size: 1em;">${device.state.temperature}°C</span>
                        </div>
                        <div style="text-align: center;">
                            <i class="fas fa-tint" style="color: #4dabf7;"></i>
                            <span class="temp-display" style="font-size: 1em;">${device.state.humidity}%</span>
                        </div>
                    </div>
                `;
            } else if (device.type === 'speaker') {
                icon = 'fa-music';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                controls = `
                    <div class="control-group">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                        <div class="control-group" style="flex-grow: 1; margin-left: 10px;">
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_down', null)"><i class="fas fa-minus"></i></button>
                            <input type="range" class="device-slider" min="0" max="100" value="${device.state.volume || 20}" 
                                onchange="controlDevice('${device.id}', 'set_volume', this.value)" style="margin: 0 5px;">
                            <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_up', null)"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                `;
            } else if (device.type === 'printer') {
                icon = 'fa-print';
                statusClass = 'on';
                
                let inkHtml = '';
                if (device.state.inks && device.state.inks.length > 0) {
                    inkHtml = '<div style="display: flex; gap: 8px; width: 100%; margin-top: 10px;">';
                    device.state.inks.forEach(ink => {
                        let colorCode = '#000';
                        if (ink.color === 'C') colorCode = '#00FFFF';
                        else if (ink.color === 'M') colorCode = '#FF00FF';
                        else if (ink.color === 'Y') colorCode = '#FFFF00';
                        else if (ink.color === 'K') colorCode = '#000000';
                        
                        inkHtml += `
                            <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                                <div style="width: 100%; height: 60px; background: #eee; border-radius: 4px; position: relative; overflow: hidden; border: 1px solid #ddd;">
                                    <div style="position: absolute; bottom: 0; left: 0; right: 0; height: ${ink.level}%; background-color: ${colorCode}; transition: height 0.5s;"></div>
                                </div>
                                <span style="font-size: 0.7em; margin-top: 4px;">${ink.level}%</span>
                            </div>
                        `;
                    });
                    inkHtml += '</div>';
                } else {
                    inkHtml = '<div style="text-align: center; color: #888; font-size: 0.9em; margin-top: 10px;">Inktniveaus onbekend</div>';
                }

                controls = `
                    <div class="control-group" style="flex-direction: column;">
                        <div style="font-size: 0.9em; color: #666;">Status: ${device.state.status || 'Gereed'}</div>
                        ${inkHtml}
                    </div>
                `;
            } else if (device.type === 'switch') {
                icon = 'fa-toggle-on';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                controls = `
                    <div class="control-group" style="justify-content: center;">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')" style="width: 60px; height: 60px; border-radius: 50%; font-size: 1.5em;">
                            <i class="fas fa-power-off"></i>
                        </button>
                    </div>
                `;
            } else if (device.type === 'receiver' || device.name.toLowerCase().includes('denon') || device.protocol === 'denon-avr') {
                icon = 'fa-compact-disc';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                // Receiver / AVR Controls
                const defaultInputs = ['TV', 'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4', 'Bluetooth', 'AUX', 'Tuner', 'NET', 'Phono', 'CD'];
                const inputs = device.inputs || defaultInputs;
                
                let inputOptions = inputs.map(inp => {
                    const val = typeof inp === 'string' ? inp.toLowerCase() : inp.id;
                    const label = typeof inp === 'string' ? inp : inp.name;
                    return `<option value="${val}">${label}</option>`;
                }).join('');
                
                controls = `
                    <div class="control-group">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                    </div>
                    <div class="control-group">
                        <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_down', null)"><i class="fas fa-minus"></i></button>
                        <i class="fas fa-volume-up" style="margin: 0 10px;"></i>
                        <input type="range" class="device-slider" min="0" max="100" value="${device.state.volume || 20}" 
                            onchange="controlDevice('${device.id}', 'set_volume', this.value)">
                        <button class="btn-mini" onclick="controlDevice('${device.id}', 'volume_up', null)"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="control-group">
                        <select class="input-selector" onchange="controlDevice('${device.id}', 'set_input', this.value)" style="margin-top: 5px; width: 100%; padding: 5px;">
                            <option value="" disabled selected>Bron selecteren</option>
                            ${inputOptions}
                        </select>
                    </div>
                `;
            } else {
                // Default / Unknown / NAS
                if (device.name.toLowerCase().includes('raspberry') || device.name.toLowerCase().includes('nas')) {
                    icon = 'fa-server';
                    device.type = 'nas';
                }
                
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                
                if (device.type === 'nas') {
                    controls = `
                        <div class="control-group">
                            <button class="btn-action" onclick="connectToNas('${device.ip}', '${device.name}')" style="width:100%; background-color: #3498db; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-hdd"></i> Verbinden / Bestanden
                            </button>
                        </div>
                    `;
                } else {
                    // Generic control
                    controls = `
                        <div class="control-group">
                            <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                                <i class="fas fa-power-off"></i>
                            </button>
                        </div>
                    `;
                }
            }

            // Check for Media Players (Apple TV, Mac, Smart TV)
            const isMediaPlayer = device.protocol === 'mdns-airplay' || 
                                  device.protocol === 'samsung-tizen' || 
                                  device.protocol === 'lg-webos' ||
                                  (device.name && device.name.toLowerCase().includes('mac'));

            if (isMediaPlayer) {
                 controls += `<div id="now-playing-${device.id}" class="now-playing-info"></div>`;
                 // Trigger update after render
                 setTimeout(() => updateDeviceState(device.id), 100);
            }

            card.innerHTML = `
                <div class="device-header">
                    <div class="device-icon ${statusClass}"><i class="fas ${icon}"></i></div>
                    <div class="device-info">
                        <h3>${device.name}</h3>
                        <p class="device-ip">${device.ip}</p>
                    </div>
                </div>
                <div class="device-body">
                    ${controls}
                    <div class="control-group">
                        <button class="btn-assign" onclick="assignDeviceToRoom('${device.id}')">Toevoegen aan kamer</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
            } catch (e) {
                console.error('Error rendering device:', device, e);
            }
        });
    }

    window.updateDeviceState = (id) => {
        fetch(`/api/devices/${id}/state`)
            .then(res => res.json())
            .then(data => {
                if (data.ok && data.state) {
                    const container = document.getElementById(`now-playing-${id}`);
                    if (!container) return;
                    
                    const s = data.state;
                    if (s.state === 'playing' || s.state === 'paused') {
                        let html = `
                            <div class="media-info" style="margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
                                <div style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.title || 'Unknown Title'}</div>
                                <div style="font-size: 0.9em; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.artist || 'Unknown Artist'}</div>
                                <div style="font-size: 0.8em; opacity: 0.6;">${s.app || ''} - ${s.state}</div>
                        `;
                        
                        // Add controls
                        html += `
                            <div class="media-controls" style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                                <button class="btn-mini" onclick="controlDevice('${id}', 'previous', null)"><i class="fas fa-step-backward"></i></button>
                                <button class="btn-mini" onclick="controlDevice('${id}', '${s.state === 'playing' ? 'pause' : 'play'}', null)">
                                    <i class="fas fa-${s.state === 'playing' ? 'pause' : 'play'}"></i>
                                </button>
                                <button class="btn-mini" onclick="controlDevice('${id}', 'next', null)"><i class="fas fa-step-forward"></i></button>
                            </div>
                        </div>`;
                        
                        container.innerHTML = html;
                    } else {
                        container.innerHTML = ''; // Clear if stopped/idle
                    }
                }
            });
    };

    window.connectToNas = (ip, name) => {
        // Check if we already have a config for this IP
        fetch('/api/nas')
            .then(res => res.json())
            .then(nasList => {
                const existing = nasList.find(n => n.host === ip || n.name === name);
                if (existing) {
                    // Already configured, go to files
                    window.location.href = `files.html?nasId=${existing.id}`;
                } else {
                    // Not configured, redirect to settings with params
                    // We can pass params via URL hash or query and handle in settings.html
                    // Or just alert for now
                    if (confirm(`Wil je NAS '${name}' (${ip}) instellen?`)) {
                        window.location.href = `settings.html?host=${ip}&name=${encodeURIComponent(name)}#nas-setup`;
                    }
                }
            });
    };

    window.toggleDevice = (id) => {
        fetch(`/api/devices/${id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'toggle' })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) fetchDevices(); // Refresh
        });
    };

    window.controlDevice = (id, command, value) => {
        fetch(`/api/devices/${id}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, value })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) fetchDevices(); // Refresh
        });
    };

    // Initial fetch
    fetchDevices();
    // Poll every 3 seconds
    setInterval(fetchDevices, 3000);

        // Listen for server-sent events to refresh immediately
        if (typeof EventSource !== 'undefined'){
            try{
                const es = new EventSource('/events');
                es.addEventListener('rooms-changed', (e)=>{ fetchDevices(); });
            }catch(e){ /* ignore */ }
        }
});
