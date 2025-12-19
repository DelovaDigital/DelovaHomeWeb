document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('spotify-widget-container');
    if (!container) return;

    const getUserId = () => localStorage.getItem('userId');

    function renderWidget(state) {
        // Handle case where Spotify is not linked
        if (state && state.available === false) {
            container.innerHTML = `
                <div class="widget" style="text-align: center; padding: 20px;">
                    <i class="fab fa-spotify" style="font-size: 2em; color: #1db954; margin-bottom: 10px;"></i>
                    <p>Koppel je Spotify account</p>
                    <button class="btn-action" onclick="linkSpotifyAccount()" style="margin-top: 10px;">
                        <i class="fas fa-link"></i> Link Spotify Account
                    </button>
                </div>
            `;
            return;
        }
        
        if (!state || !state.item) {
            container.innerHTML = `
                <div class="widget" style="text-align: center; padding: 20px;">
                    <i class="fab fa-spotify" style="font-size: 2em; color: #1db954; margin-bottom: 10px;"></i>
                    <p>Geen muziek aan het afspelen</p>
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
                        <button class="btn-action" onclick="toggleSpotifyLibrary()">
                            <i class="fas fa-music"></i> Bibliotheek openen
                        </button>
                        <button class="btn-action" onclick="toggleSpotifyDevices()" style="background-color: #333;">
                            <i class="fas fa-desktop"></i> Kies apparaat
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const track = state.item;
        // expose current track URI globally for widget actions
        window._spotifyCurrentUri = track.uri;
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
                    <div style="font-size: 0.8em; opacity: 0.9; cursor: pointer; display:flex; gap:8px; align-items:center;" >
                        <div onclick="toggleSpotifyDevices()" style="cursor:pointer;"><i class="fas fa-desktop"></i> ${deviceName} <i class="fas fa-chevron-down"></i></div>
                        <div title="Play on Sonos" style="cursor:pointer;" onclick="openSonosPickerForUri()"><i class="fas fa-volume-up"></i></div>
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

    window.linkSpotifyAccount = () => {
        const userId = getUserId();
        if (!userId) {
            alert('Log in om je Spotify account te koppelen.');
            return;
        }
        const popup = window.open(`/api/spotify/login?userId=${userId}`, 'SpotifyLogin', 'width=600,height=700');
        
        // Poll to check if the popup is closed
        const interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(interval);
                console.log('Spotify login popup closed. Refreshing status...');
                fetchStatus();
            }
        }, 500);
    };

    window.controlSpotify = (command, value) => {
        const userId = getUserId();
        if (!userId) return;

        fetch(`/api/spotify/control?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, value, userId }) // also include in body for middleware
        })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) {
                if (data.message && data.message.includes('No active Spotify device')) {
                    alert('Geen actief Spotify-apparaat. Kies een apparaat om af te spelen.');
                    toggleSpotifyDevices();
                } else {
                    console.error('Spotify control error:', data.message);
                }
            } else {
                setTimeout(fetchStatus, 500);
            }
        })
        .catch(err => console.error('Fetch error:', err));
    };

    window.toggleSpotifyDevices = async () => {
        const userId = getUserId();
        if (!userId) return;

        try {
            const res = await fetch(`/api/spotify/devices?userId=${userId}`);
            const devices = await res.json();
            
            if (!Array.isArray(devices)) {
                console.error('Invalid devices response:', devices);
                alert('Kon apparaten niet ophalen.');
                return;
            }

            const modalHtml = `
                <div class="modal-header">
                    <h3>Kies apparaat</h3>
                    <button class="close-modal" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="list-group">
                        ${devices.length > 0 ? devices.map(d => `
                            <div class="list-item ${d.is_active ? 'active' : ''}" style="display:flex; align-items:center;">
                                <div style="flex:1; cursor:pointer;" onclick="controlSpotify('transfer', '${d.id}'); closeModal();">
                                    <i class="fas ${d.type === 'Computer' ? 'fa-laptop' : d.type === 'Smartphone' ? 'fa-mobile-alt' : 'fa-desktop'}"></i>
                                    <div style="display:inline-block; margin-left: 10px; vertical-align: middle;">
                                        <div style="font-weight: bold;">${d.name}</div>
                                        <div style="font-size: 0.8em; color: #666;">${d.type}</div>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    ${d.is_active ? '<i class="fas fa-check" style="color: #1db954;"></i>' : ''}
                                    <button class="btn-mini" onclick="event.stopPropagation(); openSonosPickerForUri(); closeModal();" title="Play on Sonos"><i class="fas fa-play-circle"></i></button>
                                </div>
                            </div>
                        `).join('') : '<div style="padding:10px; text-align:center; color:#666;">Geen actieve Spotify Connect apparaten gevonden.<br>Open Spotify op een apparaat om het hier te zien.</div>'}
                    </div>
                </div>
            `;
            showModal(modalHtml);
        } catch (e) {
            console.error('Error fetching devices:', e);
            alert('Fout bij ophalen apparaten');
        }
    };

    window.openSonosPickerForUri = async (spotifyUri) => {
        try {
            const uri = spotifyUri || window._spotifyCurrentUri;
            if (!uri) return alert('No Spotify track available to play on Sonos');

            // fetch Sonos devices
            const res = await fetch('/api/sonos/devices');
            const data = await res.json();
            const sonos = (data && data.devices) ? data.devices : [];
            if (!sonos.length) return alert('Geen Sonos-apparaten gevonden');

            const modalHtml = `
                <div class="modal-header">
                    <h3>Kies Sonos-apparaat</h3>
                    <button class="close-modal" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="list-group">
                        ${sonos.map(s => `
                            <div class="list-item" onclick="(function(){ playOnSonos('${s.uuid}', '${encodeURIComponent(uri)}'); closeModal(); })();">
                                <div style="font-weight:bold;">${s.name}</div>
                                <div style="font-size:0.8em; color:#666;">${s.uuid}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            showModal(modalHtml);
        } catch (e) {
            console.error('Error opening Sonos picker:', e);
            alert('Fout bij ophalen Sonos-apparaten');
        }
    };

    window.playOnSonos = async (uuid, encodedUri) => {
        try {
            const spotifyUri = decodeURIComponent(encodedUri);
            const userId = getUserId();
            const body = { spotifyUri };
            if (userId) body.userId = userId;

            const res = await fetch(`/api/sonos/${uuid}/play-spotify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                alert('Playback started on Sonos');
            } else {
                console.error('Sonos play failed', data);
                alert('Kon niet afspelen op Sonos');
            }
        } catch (e) {
            console.error('Error playing on Sonos:', e);
            alert('Fout bij starten Sonos-afspelen');
        }
    };

    window.toggleSpotifyLibrary = async () => {
        const userId = getUserId();
        if (!userId) return;

        try {
            const [playlistsRes, albumsRes] = await Promise.all([
                fetch(`/api/spotify/playlists?userId=${userId}`),
                fetch(`/api/spotify/albums?userId=${userId}`)
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
        const userId = getUserId();
        if (!userId) {
            container.innerHTML = `<div class="widget" style="text-align: center; padding: 20px;"><p>Log in om Spotify te gebruiken.</p></div>`;
            return;
        }

        // Use /api/spotify/me to check for availability first
        fetch(`/api/spotify/me?userId=${userId}`)
            .then(res => res.json())
            .then(me => {
                if(me.available) {
                    return fetch(`/api/spotify/status?userId=${userId}`).then(res => res.json());
                } else {
                    return { available: false };
                }
            })
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
