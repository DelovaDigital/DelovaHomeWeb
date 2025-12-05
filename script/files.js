document.addEventListener('DOMContentLoaded', () => {
    const nasListEl = document.getElementById('nas-list');
    const fileListEl = document.getElementById('file-list');
    const breadcrumbEl = document.getElementById('breadcrumb');
    
    let currentNasId = null;
    let currentPath = '';

    function loadNasList() {
        fetch('/api/nas')
            .then(res => res.json())
            .then(list => {
                const container = document.createElement('div');
                list.forEach(nas => {
                    const item = document.createElement('div');
                    item.className = 'nas-item';
                    item.innerHTML = `<i class="fas fa-server"></i> ${nas.name}`;
                    item.onclick = () => selectNas(nas.id, nas.name);
                    container.appendChild(item);
                });
                // Keep header
                const header = nasListEl.querySelector('h3');
                nasListEl.innerHTML = '';
                nasListEl.appendChild(header);
                nasListEl.appendChild(container);
            });
    }

    function selectNas(id, name) {
        currentNasId = id;
        currentPath = '';
        updateBreadcrumb();
        loadFiles();
        
        // Update active state
        document.querySelectorAll('.nas-item').forEach(el => el.classList.remove('active'));
        // (Need to track element to add active class, simplified for now)
    }

    function loadFiles() {
        fileListEl.innerHTML = '<div style="padding:20px"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';
        
        const url = `/api/nas/${currentNasId}/files?path=${encodeURIComponent(currentPath)}`;
        fetch(url)
            .then(res => {
                if (!res.ok) return res.json().then(err => { throw new Error(err.message || 'Server error'); });
                return res.json();
            })
            .then(files => {
                fileListEl.innerHTML = '';
                if (!Array.isArray(files)) {
                    throw new Error('Ongeldig antwoord van server');
                }
                if (files.length === 0) {
                    fileListEl.innerHTML = '<div style="padding:20px">Lege map</div>';
                    return;
                }
                
                // Add ".." if not root
                if (currentPath) {
                    const upItem = document.createElement('div');
                    upItem.className = 'file-item';
                    upItem.innerHTML = `<div class="file-icon"><i class="fas fa-level-up-alt"></i></div><div class="file-name">..</div>`;
                    upItem.onclick = () => goUp();
                    fileListEl.appendChild(upItem);
                }

                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    
                    let icon = file.isDirectory ? 'fa-folder' : 'fa-file';
                    let color = file.isDirectory ? '#f1c40f' : '#95a5a6';
                    
                    // Icon logic for media
                    if (!file.isDirectory) {
                        const ext = file.name.split('.').pop().toLowerCase();
                        if (['mp3', 'wav', 'ogg'].includes(ext)) {
                            icon = 'fa-music';
                            color = '#e74c3c';
                        } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
                            icon = 'fa-video';
                            color = '#3498db';
                        } else if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
                            icon = 'fa-image';
                            color = '#2ecc71';
                        } else if (ext === 'pdf') {
                            icon = 'fa-file-pdf';
                            color = '#e74c3c';
                        }
                    }

                    item.innerHTML = `<div class="file-icon"><i class="fas ${icon}" style="color:${color}"></i></div><div class="file-name">${file.name}</div>`;
                    
                    if (file.isDirectory) {
                        item.onclick = () => enterFolder(file.name);
                    } else {
                        item.onclick = () => openFile(file.name);
                    }
                    fileListEl.appendChild(item);
                });
            })
            .catch(err => {
                fileListEl.innerHTML = `<div style="color:red; padding:20px">Fout: ${err.message}</div>`;
            });
    }

    function openFile(name) {
        const ext = name.split('.').pop().toLowerCase();
        const fullPath = currentPath ? `${currentPath}\\${name}` : name;
        const streamUrl = `/api/nas/${currentNasId}/stream?path=${encodeURIComponent(fullPath)}`;

        if (['mp3', 'wav', 'ogg'].includes(ext)) {
            playAudio(name, streamUrl);
        } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            playVideo(name, streamUrl);
        } else if (ext === 'pdf') {
            viewPdf(name, streamUrl);
        } else {
            alert('Bestandstype niet ondersteund voor weergave in browser.');
        }
    }

    function playAudio(name, url) {
        const modal = createMediaModal(name);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.autoplay = true;
        audio.style.width = '100%';
        audio.src = url;
        modal.content.appendChild(audio);
    }

    function playVideo(name, url) {
        const modal = createMediaModal(name);
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.width = '100%';
        video.style.maxHeight = '80vh';
        video.src = url;
        modal.content.appendChild(video);
    }

    function viewPdf(name, url) {
        const modal = createMediaModal(name);
        // Make modal wider and taller for PDF
        modal.box.style.width = '90%';
        modal.box.style.height = '90%';
        modal.box.style.maxWidth = '1200px';
        modal.content.style.height = 'calc(100% - 40px)';
        
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        modal.content.appendChild(iframe);
    }

    function createMediaModal(title) {
        // Simple modal implementation
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
        overlay.style.zIndex = '1000';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';

        const box = document.createElement('div');
        box.style.backgroundColor = '#fff';
        box.style.padding = '20px';
        box.style.borderRadius = '8px';
        box.style.maxWidth = '90%';
        box.style.width = '600px';
        box.style.position = 'relative';

        const header = document.createElement('h3');
        header.textContent = title;
        header.style.marginTop = '0';
        header.style.color = '#333';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '10px';
        closeBtn.style.border = 'none';
        closeBtn.style.background = 'none';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => document.body.removeChild(overlay);

        const content = document.createElement('div');
        content.style.marginTop = '15px';

        box.appendChild(header);
        box.appendChild(closeBtn);
        box.appendChild(content);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Close on background click
        overlay.onclick = (e) => {
            if (e.target === overlay) document.body.removeChild(overlay);
        };

        return { overlay, content, box };
    }

    function enterFolder(name) {
        currentPath = currentPath ? `${currentPath}\\${name}` : name;
        updateBreadcrumb();
        loadFiles();
    }

    function goUp() {
        if (!currentPath) return;
        const parts = currentPath.split('\\');
        parts.pop();
        currentPath = parts.join('\\');
        updateBreadcrumb();
        loadFiles();
    }

    function updateBreadcrumb() {
        const parts = currentPath.split('\\').filter(p => p);
        let html = `<span onclick="resetPath()">Root</span>`;
        let buildPath = '';
        parts.forEach((p, i) => {
            buildPath += (i > 0 ? '\\' : '') + p;
            // Capture current value for closure
            // We can't easily pass string to onclick in HTML string without escaping hell.
            // So we use a global function or data attributes.
            // Let's use data attributes and event delegation or just simple onclick with index.
            // Actually, we can just rebuild path from index.
            html += ` / <span onclick="jumpToPath('${i}')">${p}</span>`;
        });
        breadcrumbEl.innerHTML = html;
    }
    
    window.resetPath = () => {
        currentPath = '';
        updateBreadcrumb();
        loadFiles();
    };

    window.jumpToPath = (index) => {
        const parts = currentPath.split('\\').filter(p => p);
        currentPath = parts.slice(0, parseInt(index) + 1).join('\\');
        updateBreadcrumb();
        loadFiles();
    };

    loadNasList();
});
