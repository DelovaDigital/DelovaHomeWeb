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
    };

    function updateModalContent(device) {
        const body = document.getElementById('modalDeviceBody');
        const type = device.type.toLowerCase();
        const isOn = device.state.on;
        
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

        let html = `
            <i class="fas ${icon} modal-device-icon ${isOn ? 'on' : ''}"></i>
        `;

        // Power Button (except for sensors/locks)
        if (type !== 'sensor' && type !== 'lock') {
            html += `
                <button class="big-power-btn ${isOn ? 'on' : ''}" onclick="toggleDevice('${device.id}')">
                    <i class="fas fa-power-off"></i>
                </button>
            `;
        }

        // Specific Controls
        if (type === 'light' && isOn) {
            html += `
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
                </div>
            `;
        } else if (type === 'tv' && isOn) {
            html += `
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
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_down')"><i class="fas fa-minus"></i></button>
                        <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_up')"><i class="fas fa-plus"></i></button>
                    </div>
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
             html += inkHtml;
        } else if (type === 'receiver' || device.name.toLowerCase().includes('denon') || device.protocol === 'denon-avr') {
             const defaultInputs = ['TV', 'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4', 'Bluetooth', 'AUX', 'Tuner', 'NET', 'Phono', 'CD'];
             const inputs = device.inputs || defaultInputs;
             
             let inputOptions = inputs.map(inp => {
                 const val = typeof inp === 'string' ? inp.toLowerCase() : inp.id;
                 const label = typeof inp === 'string' ? inp : inp.name;
                 return `<option value="${val}">${label}</option>`;
             }).join('');

             html += `
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
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'mute')"><i class="fas fa-volume-mute"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_down')"><i class="fas fa-minus"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'volume_up')"><i class="fas fa-plus"></i></button>
                </div>
             `;
        } else if (type === 'thermostat') {
            html += `
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
            html += `
                <button class="big-power-btn" style="background-color: ${isLocked ? '#dc3545' : '#28a745'}; width: 100px; height: 100px;" 
                    onclick="controlDevice('${device.id}', '${isLocked ? 'unlock' : 'lock'}')">
                    <i class="fas ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <p>${isLocked ? 'Vergrendeld' : 'Ontgrendeld'}</p>
            `;
        } else if (type === 'cover' || type === 'blind') {
            html += `
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
            html += `
                <div class="remote-grid">
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'start')"><i class="fas fa-play"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'pause')"><i class="fas fa-pause"></i></button>
                    <button class="remote-btn" onclick="controlDevice('${device.id}', 'dock')"><i class="fas fa-home"></i></button>
                </div>
            `;
        } else if (type === 'sensor') {
            html += `
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
        }

        body.innerHTML = html;
    }

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
});
