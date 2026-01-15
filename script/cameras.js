async function initCameras() {
    const grid = document.getElementById('cameraGrid');
    const recordingsList = document.getElementById('recordingsList');
    
    // Fetch all devices
    const res = await fetch('/api/devices');
    const devices = await res.json();
    const cameras = devices.filter(d => 
        (d.type && (d.type.toLowerCase() === 'camera' || d.type.toLowerCase() === 'doorbell')) ||
        (d.attributes && d.attributes.rtsp_url)
    );

    if (cameras.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; padding: 50px; text-align:center;"><h3>No cameras found</h3><p>Ensure cameras are discovered or added via Settings.</p></div>';
        return;
    }

    grid.innerHTML = '';
    cameras.forEach(cam => {
        const hasUrl = cam.attributes && cam.attributes.rtsp_url;
        
        const card = document.createElement('div');
        card.className = 'camera-card';
        card.innerHTML = `
            <div class="camera-view" id="view-${cam.id}">
                ${hasUrl ? `<canvas id="canvas-${cam.id}"></canvas>` : ''}
                
                ${!hasUrl ? `
                    <div class="setup-placeholder" onclick="openSettings('${cam.id}')">
                        <i class="fas fa-wrench" style="font-size: 2.5em; margin-bottom: 15px; opacity: 0.7;"></i>
                        <span style="font-weight: 500;">Configure Stream</span>
                    </div>
                ` : ''}

                <!-- Overlay Header -->
                <div class="camera-overlay-header">
                    <div class="camera-name">
                        <i class="fas fa-video"></i> ${cam.name}
                    </div>
                    ${hasUrl ? `<div class="live-badge blink"><i class="fas fa-circle"></i> LIVE</div>` : ''}
                </div>

                <!-- Floating Controls -->
                <div class="camera-controls">
                    ${hasUrl ? `
                        <button class="cam-btn" id="rec-btn-${cam.id}" title="Start Recording">
                            <i class="fas fa-bullseye"></i>
                        </button>
                        <button class="cam-btn" onclick="openFullscreen('${cam.id}')" title="Fullscreen">
                            <i class="fas fa-expand"></i>
                        </button>
                    ` : ''}
                    <button class="cam-btn" onclick="openSettings('${cam.id}')" title="Settings">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>
        `;
        grid.appendChild(card);

        if (hasUrl) {
            setupStream(cam);
        }
    });

    // Check for "Configure this camera" query param
    const urlParams = new URLSearchParams(window.location.search);
    const focusId = urlParams.get('setup');
    if (focusId) openSettings(focusId);
}

function setupStream(cam) {
    const canvas = document.getElementById(`canvas-${cam.id}`);
    const rtspUrl = cam.attributes.rtsp_url;
    
    // Construct WebSocket URL
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${location.host}/stream?deviceId=${cam.id}&rtspUrl=${encodeURIComponent(rtspUrl)}`;
    
    // Init JSMpeg
    // Check if player already exists
    if(cam.player) {
         cam.player.destroy();
    }
    
    cam.player = new JSMpeg.Player(wsUrl, { 
        canvas: canvas, 
        audio: false, // Audio often breaks MPEG1 conversion latency
        disableGl: false
    });

    // Record Button Logic
    bindRecordButton(cam, rtspUrl);
}

function bindRecordButton(cam, rtspUrl) {
    const recBtn = document.getElementById(`rec-btn-${cam.id}`);
    if (!recBtn) return;
    
    let isRecording = false;

    recBtn.addEventListener('click', async () => {
        if (!isRecording) {
            // Start
            try {
                const res = await fetch('/api/camera/record/start', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ deviceId: cam.id, rtspUrl })
                });
                const data = await res.json();
                if (data.success) {
                    isRecording = true;
                    recBtn.classList.add('recording'); // Use CSS class for animation
                } else {
                    alert((window.t ? window.t('recording_start_failed') : 'Failed to start recording: ') + (data.error || ''));
                }
            } catch(e) { console.error(e); }
        } else {
            // Stop
            try {
                await fetch('/api/camera/record/stop', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ deviceId: cam.id, rtspUrl })
                });
                isRecording = false;
                recBtn.classList.remove('recording');
            } catch(e) { console.error(e); }
        }
    });
}

window.openSettings = async function(deviceId) {
    const modal = document.getElementById('urlModal');
    const nameEl = document.getElementById('setupDeviceName');
    const idInput = document.getElementById('setupDeviceId');
    const urlInput = document.getElementById('rtspUrlInput');

    // Get current device info
    try {
        const res = await fetch('/api/devices'); // Inefficient but simple
        const devices = await res.json();
        const dev = devices.find(d => d.id === deviceId);
        
        if (dev) {
            nameEl.textContent = dev.name;
            idInput.value = dev.id;
            urlInput.value = (dev.attributes && dev.attributes.rtsp_url) ? dev.attributes.rtsp_url : '';
            modal.style.display = 'block';

            // Close logic
            modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
            window.onclick = (e) => { if(e.target == modal) modal.style.display = 'none'; }
        }
    } catch(e) { console.error(e); }
};

document.getElementById('saveUrlBtn').addEventListener('click', async () => {
    const deviceId = document.getElementById('setupDeviceId').value;
    const rtspUrl = document.getElementById('rtspUrlInput').value.trim();
    
    if(!deviceId || !rtspUrl) return;
    
    try {
        const res = await fetch(`/api/devices/${deviceId}/config`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ rtspUrl })
        });
        const data = await res.json();
        
        if (data.ok) {
            alert(window.t ? window.t('saved_reloading') : 'Saved! Reloading...');
            document.getElementById('urlModal').style.display = 'none';
            location.reload();
        } else {
            alert((window.t ? window.t('error') : 'Error') + ': ' + data.error);
        }
    } catch(e) {
        alert(window.t ? window.t('request_failed') : 'Request failed');
    }
});

function openFullscreen(id) {
    const canvas = document.getElementById(`canvas-${id}`);
    if(!canvas) return;
    if (canvas.requestFullscreen) canvas.requestFullscreen();
    else if (canvas.webkitRequestFullscreen) canvas.webkitRequestFullscreen();
}

window.openRecordingsModal = async function() {
    const modal = document.getElementById('recordingsModal');
    const list = document.getElementById('recordingsList');
    modal.style.display = 'block';
    
    list.innerHTML = 'Loading...';
    try {
        const res = await fetch('/api/camera/recordings');
        const files = await res.json();
        
        if (files.length === 0) {
            list.innerHTML = '<div style="padding:10px;">No recordings found.</div>';
        } else {
            list.innerHTML = files.map(f => `
                <div class="file-item">
                    <div>
                        <strong>${f.filename}</strong><br>
                        <small style="opacity:0.7">${new Date(f.timestamp).toLocaleString()}</small>
                    </div>
                    <a href="${f.url}" target="_blank" class="btn btn-sm" style="background:var(--primary); color:white; padding:4px 8px; border-radius:4px;">Download</a>
                </div>
            `).join('');
        }
        
        modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if(e.target == modal) modal.style.display = 'none'; }

    } catch(e) {
        list.innerHTML = 'Error loading recordings.';
    }
};

document.addEventListener('DOMContentLoaded', initCameras);
