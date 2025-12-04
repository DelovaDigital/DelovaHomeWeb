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
        grid.innerHTML = '';
        if (devices.length === 0) {
            grid.innerHTML = '<div class="loading-devices"><i class="fas fa-spinner fa-spin"></i> Apparaten zoeken...</div>';
            return;
        }

        devices.forEach(device => {
            const card = document.createElement('div');
            card.className = 'device-card';
            
            let icon = 'fa-question-circle';
            let controls = '';
            let statusClass = '';

            if (device.type === 'light') {
                icon = 'fa-lightbulb';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                controls = `
                    <div class="control-group">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                        <input type="range" class="device-slider" min="0" max="100" value="${device.state.brightness || 50}" 
                            onchange="controlDevice('${device.id}', 'set_brightness', this.value)">
                    </div>
                `;
            } else if (device.type === 'tv') {
                icon = 'fa-tv';
                const isOn = device.state.on;
                statusClass = isOn ? 'on' : 'off';
                controls = `
                    <div class="control-group">
                        <button class="btn-toggle ${isOn ? 'active' : ''}" onclick="toggleDevice('${device.id}')">
                            <i class="fas fa-power-off"></i>
                        </button>
                    </div>
                    <div class="control-group">
                        <i class="fas fa-volume-up"></i>
                        <input type="range" class="device-slider" min="0" max="100" value="${device.state.volume || 20}" 
                            onchange="controlDevice('${device.id}', 'set_volume', this.value)">
                    </div>
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
        });
    }

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
