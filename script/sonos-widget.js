document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('sonos-widget-container');
    if (!container) return; // Only run if container exists

    // State
    let sonosDevices = [];
    let activeUuid = null;
    let sonosState = {};
    let pollTimer = null;

    // Fetch Devices
    async function fetchDevices() {
        try {
            const res = await fetch('/api/sonos/devices');
            const data = await res.json();
            if (data && data.devices) {
                sonosDevices = data.devices;
                if (!activeUuid && sonosDevices.length > 0) {
                    activeUuid = sonosDevices[0].uuid;
                }
                render();
                fetchState();
            }
        } catch (e) {
            console.error('Error fetching Sonos devices:', e);
            container.innerHTML = `<div class="unified-card widget"><div class="unified-card-header"><h4>Sonos</h4></div><div style="padding:15px; opacity:0.6;">Sonos service unreachable</div></div>`;
        }
    }

    // Fetch State (for active device)
    async function fetchState() {
        if (!activeUuid) return;
        try {
            const res = await fetch(`/api/sonos/${activeUuid}/state`);
            const data = await res.json();
            sonosState = data;
            renderContent(); 
        } catch (e) {
            // ignore
        }
    }

    // Controls
    async function control(cmd, val) {
        if (!activeUuid) return;
        try {
            // Optimistic update
            if (cmd === 'play') sonosState.status = 'PLAYING';
            if (cmd === 'pause') sonosState.status = 'PAUSED_PLAYBACK';
            if (cmd === 'set_volume') sonosState.volume = val;
            renderContent();

            await fetch(`/api/sonos/${activeUuid}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd, value: val })
            });
            setTimeout(fetchState, 500); // refresh after delay
        } catch (e) {
            console.error('Sonos control error:', e);
        }
    }

    function render() {
        if (sonosDevices.length === 0) {
            container.innerHTML = ''; // Hide if no devices
            return;
        }

        // Setup Main Structure if unique render
        if (!document.getElementById('sonos-main-card')) {
            container.innerHTML = `
                <div class="unified-card widget" id="sonos-main-card">
                    <div class="unified-card-header">
                        <h4><i class="fas fa-music" style="color:#f97316;"></i> Sonos</h4>
                        ${sonosDevices.length > 1 ? `
                            <select id="sonos-device-select" class="header-select">
                                ${sonosDevices.map(d => `<option value="${d.uuid}">${d.name}</option>`).join('')}
                            </select>
                        ` : `<span>${sonosDevices[0].name}</span>`}
                    </div>
                    <div id="sonos-content" style="padding: 15px;">
                        <!-- Content Rendered Here -->
                    </div>
                </div>
            `;

            // Bind Select
            const sel = document.getElementById('sonos-device-select');
            if (sel) {
                sel.value = activeUuid;
                sel.addEventListener('change', (e) => {
                    activeUuid = e.target.value;
                    fetchState();
                });
            }
        } else {
             // Just update select if needed? usually not needed if re-rendering whole list
        }
        
        renderContent();
    }

    function renderContent() {
        const contentEl = document.getElementById('sonos-content');
        if (!contentEl) return;

        const isPlaying = sonosState.status === 'PLAYING' || sonosState.status === 'TRANSITIONING';
        const track = sonosState.track?.title || 'Geen muziek';
        const artist = sonosState.track?.artist || sonosDevices.find(d => d.uuid === activeUuid)?.name || '';
        const art = sonosState.track?.albumArtURI || null; // API needs to provide this actually, currently maybe URI
        
        // Artwork handling: Sonos often returns a relative URL for local art, or full for services. 
        // Our API returns URI. We might need to proxy art or just show icon.
        // For now, simple icon.

        contentEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <div style="width: 60px; height: 60px; background: rgba(249, 115, 22, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-music" style="font-size: 24px; color: #f97316;"></i>
                </div>
                <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 700; font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track}</div>
                    <div style="opacity: 0.7; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${artist}</div>
                </div>
            </div>

            <!-- Progress Bar (Optional, hard without real-time updates) -->
            
            <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 15px;">
                <button class="btn-icon-large" onclick="window.sonosControl('previous')" title="Vorige"><i class="fas fa-step-backward"></i></button>
                <button class="btn-icon-large ${isPlaying ? 'active' : ''}" onclick="window.sonosControl('${isPlaying ? 'pause' : 'play'}')" title="${isPlaying ? 'Pauze' : 'Speel'}">
                    <i class="fas fa-${isPlaying ? 'pause' : 'play'}"></i>
                </button>
                <button class="btn-icon-large" onclick="window.sonosControl('next')" title="Volgende"><i class="fas fa-step-forward"></i></button>
            </div>

            <!-- Volume -->
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-volume-down" style="opacity: 0.5;"></i>
                <input type="range" min="0" max="100" value="${sonosState.volume || 0}" 
                    style="flex: 1; accent-color: #f97316;" 
                    onchange="window.sonosControl('set_volume', this.value)"
                >
                <i class="fas fa-volume-up" style="opacity: 0.5;"></i>
            </div>
        `;
    }

    // Expose control to global scope for onclick handlers
    window.sonosControl = (cmd, val) => control(cmd, val);

    // Styling injection for specific sonos stuff if needed
    const style = document.createElement('style');
    style.innerHTML = `
        .header-select {
            background: rgba(255,255,255,0.1);
            border: none;
            color: inherit;
            border-radius: 5px;
            padding: 2px 5px;
            font-size: 0.9em;
            outline: none;
        }
        .header-select option {
            background: #333;
            color: white;
        }
        .btn-icon-large {
            background: rgba(255,255,255,0.1);
            border: none;
            width: 45px;
            height: 45px;
            border-radius: 50%;
            cursor: pointer;
            color: inherit;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .btn-icon-large:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
        .btn-icon-large.active { background: #f97316; color: white; box-shadow: 0 0 15px rgba(249, 115, 22, 0.4); }
    `;
    document.head.appendChild(style);


    // Init
    fetchDevices();
    pollTimer = setInterval(() => {
        if(document.visibilityState === 'visible') fetchState();
    }, 3000);
});
