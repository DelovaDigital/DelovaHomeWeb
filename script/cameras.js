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
            <div class="camera-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-video"></i>
                    <strong>${cam.name}</strong>
                </div>
                <div class="actions" style="display:flex; gap:8px;">
                     ${hasUrl ? 
                        `<button class="btn-icon" id="rec-btn-${cam.id}" title="Record"><i class="fas fa-circle"></i></button>` : ''
                     }
                     <button class="btn-icon" onclick="openSettings('${cam.id}')" title="Settings"><i class="fas fa-cog"></i></button>
                     ${hasUrl ? 
                        `<button class="btn-icon" onclick="openFullscreen('${cam.id}')"><i class="fas fa-expand"></i></button>` : ''
                     }
                </div>
            </div>
            <div class="camera-view" id="view-${cam.id}">
                ${hasUrl ? 
                    `<div class="rec-indicator" id="rec-ind-${cam.id}"><i class="fas fa-circle blink"></i> REC</div>
                     <canvas id="canvas-${cam.id}" style="width:100%; height:100%; object-fit: cover;"></canvas>` 
                    : 
                    `<div class="setup-placeholder" onclick="openSettings('${cam.id}')">
                        <i class="fas fa-wrench" style="font-size:2em; margin-bottom:10px;"></i>
                        <span>Click to configure stream</span>
                     </div>`
                }
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
    const recInd = document.getElementById(`rec-ind-${cam.id}`);
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
                    recBtn.style.color = '#ef4444'; // Red
                    recInd.classList.add('active');
                } else {
                    alert('Failed to start recording: ' + data.error);
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
                recBtn.style.color = '';
                recInd.classList.remove('active');
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
            alert('Saved! Reloading...');
            document.getElementById('urlModal').style.display = 'none';
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    } catch(e) {
        alert('Request failed');
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
