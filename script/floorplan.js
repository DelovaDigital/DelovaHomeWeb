document.addEventListener('DOMContentLoaded', async () => {
    const floorplanWrapper = document.getElementById('floorplan-wrapper');
    const floorplanImg = document.getElementById('floorplanImg');
    const markerLayer = document.getElementById('marker-layer');
    const editSidebar = document.getElementById('edit-sidebar');
    const deviceList = document.getElementById('device-list');
    const controls = {
        view: document.getElementById('viewControls'),
        edit: document.getElementById('editControls')
    };
    
    let isEditMode = false;
    let markers = []; // { deviceId, x (%), y (%) }
    let devices = [];
    
    // Size marker layer to match image
    floorplanImg.onload = () => {
        markerLayer.style.width = floorplanImg.clientWidth + 'px';
        markerLayer.style.height = floorplanImg.clientHeight + 'px';
    };
    // Observe resize
    new ResizeObserver(() => {
        markerLayer.style.width = floorplanImg.clientWidth + 'px';
        markerLayer.style.height = floorplanImg.clientHeight + 'px';
    }).observe(floorplanImg);

    // --- Load Data ---
    async function loadData() {
        try {
            const [fpRes, devRes] = await Promise.all([
                fetch('/api/floorplan'),
                fetch('/api/devices')
            ]);
            const fpData = await fpRes.json();
            devices = await devRes.json();
            
            if (fpData.hasImage) {
                floorplanImg.src = fpData.imageUrl;
                document.getElementById('placeholder').style.display = 'none';
            }
            
            markers = fpData.markers || [];
            renderMarkers();
        } catch(e) { console.error(e); }
    }
    
    await loadData();
    setInterval(updateStatuses, 5000);

    // --- Rendering ---
    function renderMarkers() {
        markerLayer.innerHTML = '';
        markers.forEach((m, index) => {
            const dev = devices.find(d => d.id === m.deviceId);
            if (!dev) return; // Device removed?
            
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.left = m.x + '%';
            el.style.top = m.y + '%';
            el.dataset.id = m.deviceId;
            el.dataset.name = dev.name;
            el.innerHTML = `<i class="${getDeviceIcon(dev)}"></i>`;
            
            // Status class
            if (dev.state && (dev.state === 'on' || dev.state.on === true)) {
                el.classList.add('on');
            }

            // Drag logic (Edit mode only)
            if (isEditMode) {
                el.draggable = true;
                el.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', index }));
                    el.classList.add('dragging');
                    e.stopPropagation(); // Don't trigger new item drag
                });
                el.addEventListener('dragend', () => el.classList.remove('dragging'));
                
                // Right click remove
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm(window.t('confirm_remove_marker'))) {
                        markers.splice(index, 1);
                        renderMarkers();
                    }
                });
            } else {
                // Click to toggle
                el.onclick = () => toggleDevice(dev);
            }

            markerLayer.appendChild(el);
        });
    }

    async function updateStatuses() {
        try {
            const res = await fetch('/api/devices');
            devices = await res.json();
            
            const markerEls = document.querySelectorAll('.marker');
            markerEls.forEach(el => {
                const id = el.dataset.id;
                const dev = devices.find(d => d.id === id);
                if (dev) {
                    if (dev.state && (dev.state === 'on' || dev.state.on === true)) {
                        el.classList.add('on');
                    } else {
                        el.classList.remove('on');
                    }
                }
            });
        } catch(e){}
    }
    
    async function toggleDevice(dev) {
        const cmd = (dev.state && (dev.state === 'on' || dev.state.on === true)) ? 'turn_off' : 'turn_on';
        await fetch(`/api/devices/${dev.id}/command`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ command: cmd })
        });
        // Optimistic update
        // updateStatuses(); // Will happen on interval or manual refresh
    }

    // --- Edit Mode ---
    document.getElementById('btnEditMode').onclick = () => {
        isEditMode = true;
        controls.view.style.display = 'none';
        controls.edit.style.display = 'flex';
        editSidebar.style.display = 'flex';
        renderMarkers(); 
        renderDeviceList();
    };
    
    document.getElementById('btnCancel').onclick = () => {
        isEditMode = false;
        controls.view.style.display = 'block';
        controls.edit.style.display = 'none';
        editSidebar.style.display = 'none';
        loadData(); // Revert
    };

    document.getElementById('btnSave').onclick = async () => {
        await fetch('/api/floorplan/markers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ markers })
        });
        alert(window.t('saved'));
        isEditMode = false;
        controls.view.style.display = 'block';
        controls.edit.style.display = 'none';
        editSidebar.style.display = 'none';
        renderMarkers();
    };

    // --- Image Upload ---
    document.getElementById('btnUpload').onclick = () => document.getElementById('fileUpload').click();
    document.getElementById('fileUpload').onchange = async (e) => {
         const file = e.target.files[0];
         if (!file) return;
         if (file.size > 100 * 1024 * 1024) return alert(window.t('file_too_large'));
         
         const reader = new FileReader();
         reader.onload = async (ev) => {
             const base64 = ev.target.result;
             try {
                const res = await fetch('/api/floorplan/upload', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ image: base64 })
                });
                const data = await res.json();
                if (data.ok) {
                    floorplanImg.src = base64;
                    document.getElementById('placeholder').style.display = 'none';
                } else {
                    console.error('Upload failed response:', data);
                    alert(window.t('upload_failed') + ': ' + (data.error || window.t('unknown_error')));
                }
             } catch(err) { 
                 console.error('Upload error:', err);
                 alert(window.t('upload_request_failed') + ': ' + err.message); 
             }
         };
         reader.readAsDataURL(file);
    };

    // --- Drag & Drop ---
    function renderDeviceList() {
        deviceList.innerHTML = '';
        const search = document.getElementById('deviceSearch').value.toLowerCase();
        
        devices
            .filter(d => (d.name||'').toLowerCase().includes(search))
            .forEach(d => {
                const el = document.createElement('div');
                el.className = 'draggable-item';
                el.draggable = true;
                el.innerHTML = `<i class="${getDeviceIcon(d)}"></i> ${d.name}`;
                
                el.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new', deviceId: d.id }));
                });
                
                deviceList.appendChild(el);
            });
    }
    
    document.getElementById('deviceSearch').oninput = renderDeviceList;

    floorplanWrapper.addEventListener('dragover', (e) => e.preventDefault());
    floorplanWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!isEditMode) return;
        
        const raw = e.dataTransfer.getData('text/plain');
        if (!raw) return;
        const data = JSON.parse(raw);
        
        // Calculate coords relative to image/layer
        const rect = floorplanImg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Boundaries check
        if(x < 0 || x > 100 || y < 0 || y > 100) return;

        if (data.type === 'new') {
            markers.push({ deviceId: data.deviceId, x, y });
        } else if (data.type === 'move') {
            markers[data.index].x = x;
            markers[data.index].y = y;
        }
        
        renderMarkers();
    });

    function getDeviceIcon(d) {
        if (window.getDeviceIconClass) return window.getDeviceIconClass(d);
        return 'fas fa-cube';
    }
});