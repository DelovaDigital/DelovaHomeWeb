document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('spotify-widget-container');
    if (!container) return;

    let isExpanded = false;

    function renderWidget(state) {
        if (!state || !state.item) {
            container.innerHTML = `
                <div class="widget" style="text-align: center; padding: 20px;">
                    <i class="fab fa-spotify" style="font-size: 2em; color: #1db954; margin-bottom: 10px;"></i>
                    <p>Geen muziek aan het afspelen</p>
                    <button class="btn-action" onclick="toggleSpotifyLibrary()" style="margin-top: 10px;">
                        <i class="fas fa-music"></i> Bibliotheek openen
                    </button>
                </div>
            `;
            return;
        }

        const track = state.item;
        const artist = track.artists.map(a => a.name).join(', ');
        const image = track.album.images[0]?.url;
        const deviceName = state.device ? state.device.name : 'Unknown Device';
        const isPlaying = state.is_playing;
        const volume = state.device ? state.device.volume_percent : 50;

        container.innerHTML = `
            <div class="widget spotify-widget" style="padding: 0; overflow: hidden;">
                <div class="device-header" style="background: #1db954; color: white; padding: 10px 15px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fab fa-spotify" style="font-size: 1.2em;"></i>
                        <span style="font-weight: bold;">Spotify</span>
                    </div>
                    <div style="font-size: 0.8em; opacity: 0.9; cursor: pointer;" onclick="toggleSpotifyDevices()">
                        <i class="fas fa-speaker"></i> ${deviceName} <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                
                <div class="device-body" style="padding: 15px;">
                    <div style="display: flex; gap: 15px; margin-bottom: 15px; align-items: center;">
                        <img src="${image}" style="width: 80px; height: 80px; border-radius: 4px; object-fit: cover; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        <div style="overflow: hidden; flex: 1;">
                            <div style="font-weight: bold; font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.name}</div>
                            <div style="font-size: 0.9em; color: #666;">${artist}</div>
                            <div style="font-size: 0.8em; color: #888; margin-top: 4px;">${track.album.name}</div>
                        </div>
                    </div>

                    <div class="control-group" style="justify-content: center; gap: 20px; margin-bottom: 15px;">
                        <button class="btn-mini" onclick="controlSpotify('previous')"><i class="fas fa-step-backward"></i></button>
                        <button class="btn-toggle ${isPlaying ? 'active' : ''}" onclick="controlSpotify('${isPlaying ? 'pause' : 'play'}')" 
                            style="width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2em;">
                            <i class="fas fa-${isPlaying ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn-mini" onclick="controlSpotify('next')"><i class="fas fa-step-forward"></i></button>
                    </div>

                    <div class="control-group">
                        <i class="fas fa-volume-up" style="margin: 0 10px; color: #666;"></i>
                        <input type="range" class="device-slider" min="0" max="100" value="${volume}" 
                            oninput="this.nextElementSibling.textContent = this.value + '%'"
                            onchange="controlSpotify('set_volume', this.value)" style="flex: 1;">
                        <span style="font-size: 0.8em; color: #666; width: 30px; text-align: right;">${volume}%</span>
                    </div>

                    <div style="margin-top: 15px; text-align: center;">
                        <button class="btn-text" onclick="toggleSpotifyLibrary()" style="color: #1db954; background: none; border: none; cursor: pointer; font-weight: bold;">
                            <i class="fas fa-list"></i> Afspeellijsten & Albums
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    window.controlSpotify = (command, value) => {
        fetch('/api/spotify/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, value })
        })
        .then(() => setTimeout(fetchStatus, 500));
    };

    window.toggleSpotifyDevices = async () => {
        const res = await fetch('/api/spotify/devices');
        const devices = await res.json();
        
        const modalHtml = `
            <div class="modal-header">
                <h3>Kies apparaat</h3>
                <button class="close-modal" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="list-group">
                    ${devices.map(d => `
                        <div class="list-item ${d.is_active ? 'active' : ''}" onclick="controlSpotify('transfer', '${d.id}'); closeModal();">
                            <i class="fas ${d.type === 'Computer' ? 'fa-laptop' : d.type === 'Smartphone' ? 'fa-mobile-alt' : 'fa-speaker'}"></i>
                            <div style="flex: 1; margin-left: 10px;">
                                <div style="font-weight: bold;">${d.name}</div>
                                <div style="font-size: 0.8em; color: #666;">${d.type}</div>
                            </div>
                            ${d.is_active ? '<i class="fas fa-check" style="color: #1db954;"></i>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        showModal(modalHtml);
    };

    window.toggleSpotifyLibrary = async () => {
        try {
            const [playlistsRes, albumsRes] = await Promise.all([
                fetch('/api/spotify/playlists'),
                fetch('/api/spotify/albums')
            ]);
            
            const playlists = await playlistsRes.json();
            const albums = await albumsRes.json();
            
            const modalHtml = `
                <div class="modal-header">
                    <h3>Bibliotheek</h3>
                    <button class="close-modal" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
                    <div style="margin-bottom: 10px; font-weight: bold; color: #666;">Afspeellijsten</div>
                    <div class="list-group">
                        ${playlists.length ? playlists.map(p => `
                            <div class="list-item" onclick="controlSpotify('play_context', '${p.uri}'); closeModal();">
                                <img src="${p.images?.[0]?.url || 'img/default-album.png'}" style="width: 40px; height: 40px; border-radius: 4px;">
                                <div style="flex: 1; margin-left: 10px;">
                                    <div style="font-weight: bold;">${p.name}</div>
                                    <div style="font-size: 0.8em; color: #666;">${p.tracks.total} nummers</div>
                                </div>
                                <i class="fas fa-play-circle" style="color: #1db954; font-size: 1.5em;"></i>
                            </div>
                        `).join('') : '<div style="padding: 10px; color: #999;">Geen afspeellijsten gevonden</div>'}
                    </div>
                    
                    <div style="margin: 20px 0 10px 0; font-weight: bold; color: #666;">Albums</div>
                    <div class="list-group">
                        ${albums.length ? albums.map(a => `
                            <div class="list-item" onclick="controlSpotify('play_context', '${a.uri}'); closeModal();">
                                <img src="${a.images?.[0]?.url || 'img/default-album.png'}" style="width: 40px; height: 40px; border-radius: 4px;">
                                <div style="flex: 1; margin-left: 10px;">
                                    <div style="font-weight: bold;">${a.name}</div>
                                    <div style="font-size: 0.8em; color: #666;">${a.artists.map(art => art.name).join(', ')}</div>
                                </div>
                                <i class="fas fa-play-circle" style="color: #1db954; font-size: 1.5em;"></i>
                            </div>
                        `).join('') : '<div style="padding: 10px; color: #999;">Geen albums gevonden</div>'}
                    </div>
                </div>
            `;
            showModal(modalHtml);
        } catch (e) {
            console.error('Error loading library:', e);
            alert('Kon bibliotheek niet laden. Controleer de console voor details.');
        }
    };

    function fetchStatus() {
        fetch('/api/spotify/status')
            .then(res => res.json())
            .then(renderWidget)
            .catch(console.error);
    }

    // Poll every 5 seconds
    setInterval(fetchStatus, 5000);
    fetchStatus();
});

// Simple Modal Helper (if not already present)
function showModal(html) {
    let modal = document.getElementById('spotify-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'spotify-modal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-content">${html}</div>`;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('spotify-modal');
    if (modal) modal.style.display = 'none';
}
