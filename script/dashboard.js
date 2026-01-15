document.addEventListener('DOMContentLoaded', () => {
  const roomsList = document.getElementById('roomsList');
  const newRoomName = document.getElementById('newRoomName');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const weatherContent = document.getElementById('weatherContent');
  const runSpeedtest = document.getElementById('runSpeedtest');
  const speedtestResults = document.getElementById('speedtestResults');

  async function apiGet(path){
    const res = await fetch(path);
    return res.json();
  }

  async function fetchRooms(){
    try{
      const rooms = await apiGet('/api/rooms');
      return Array.isArray(rooms) ? rooms : [];
    }catch(e){return []}
  }

  async function fetchMap(){
    try{ 
        const map = await apiGet('/api/room-mapping');
        return map || {}; 
    }catch(e){ return {}; }
  }

  async function fetchDevices(){
    try{ 
        const devices = await apiGet('/api/devices');
        return Array.isArray(devices) ? devices : []; 
    }catch(e){ return []; }
  }

  async function render(){
    if(!roomsList) return; // page doesn't include rooms list -> nothing to render
    const [rooms, map, devices] = await Promise.all([fetchRooms(), fetchMap(), fetchDevices()]);
    const deviceById = {};
    devices.forEach(d => deviceById[d.id] = d);

    roomsList.innerHTML = '';
    if(rooms.length === 0){
      roomsList.innerHTML = `<div class="empty">${window.t ? window.t('no_rooms') : 'Geen kamers. Maak er één aan.'}</div>`;
      return;
    }

    rooms.forEach(r => {
      const roomEl = document.createElement('div');
      roomEl.className = 'unified-card'; // Use new class
      const devs = Object.keys(map).filter(k => map[k] === r.id).map(id => deviceById[id]).filter(Boolean);

      roomEl.innerHTML = `
        <div class="unified-card-header">
          <h4>${r.name}</h4>
          <div class="room-actions">
            <!-- Icons for edit/delete -->
            <button data-id="${r.id}" class="rename-room btn-icon"><i class="fas fa-edit"></i></button>
            <button data-id="${r.id}" class="delete-room btn-icon"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div class="room-device-list">
          ${devs.length > 0 ? devs.map(d => `
             <div class="room-device-item">
                <span><i class="${typeof getDeviceIconClass === 'function' ? getDeviceIconClass(d) : 'fas fa-cube'}"></i> ${d.name}</span>
                <button data-device="${d.id}" class="unassign btn-xs btn-danger"><i class="fas fa-times"></i></button>
             </div>
          `).join('') : `<div class="empty" style="opacity:0.6; font-size:0.9em;">${window.t ? window.t('no_devices') : 'Geen apparaten'}</div>`}
        </div>
      `;

      roomsList.appendChild(roomEl);
    });

    // attach handlers
    document.querySelectorAll('.unassign').forEach(btn => btn.addEventListener('click', async (e)=>{
      const deviceId = btn.getAttribute('data-device');
      await fetch('/api/room-mapping', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId: null })});
      render();
    }));

    document.querySelectorAll('.delete-room').forEach(btn => btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      if(!confirm(window.t ? window.t('delete_room_confirm') : 'Kamer verwijderen?')) return;
      await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
      render();
    }));

    document.querySelectorAll('.rename-room').forEach(btn => btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      const name = prompt(window.t ? window.t('new_room_name_prompt') : 'Nieuwe naam voor kamer');
      if(name) {
        await fetch(`/api/rooms/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
        render();
      }
    }));
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', async ()=>{
      const name = newRoomName && newRoomName.value && newRoomName.value.trim();
      if(!name) return alert(window.t ? window.t('enter_name') : 'Vul een naam in');
      await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      if(newRoomName) newRoomName.value = '';
      render();
    });
  }


  // Weather widget (Open-Meteo)
  async function loadWeather(){
    try{
      let loc = { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 };
      try {
          const saved = localStorage.getItem('weather_location');
          if(saved) loc = JSON.parse(saved);
      } catch(e){}

      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current_weather=true`)
        .then(r => r.json());
      
      if(w && w.current_weather){
        const code = w.current_weather.weathercode;
        const temp = w.current_weather.temperature;
        const wind = w.current_weather.windspeed;
        
        let iconClass = 'fa-sun';
        let colorClass = 'weather-icon-sun';
        let desc = 'Zonnig';

        // WMO Weather interpretation codes (WW)
        if (code === 0) {
            iconClass = 'fa-sun';
            colorClass = 'weather-icon-sun';
            desc = 'Zonnig';
        } else if (code >= 1 && code <= 3) {
            if (code === 1) { 
                iconClass = 'fa-cloud-sun'; 
                desc = 'Licht bewolkt'; 
            } else { 
                iconClass = 'fa-cloud'; 
                desc = 'Bewolkt'; 
            }
            colorClass = 'weather-icon-cloud';
        } else if (code >= 45 && code <= 48) {
            iconClass = 'fa-smog';
            colorClass = 'weather-icon-cloud';
            desc = 'Mist';
        } else if (code >= 51 && code <= 67) {
            iconClass = 'fa-cloud-rain';
            colorClass = 'weather-icon-rain';
            desc = 'Regen';
        } else if (code >= 71 && code <= 77) {
            iconClass = 'fa-snowflake';
            colorClass = 'weather-icon-snow';
            desc = 'Sneeuw';
        } else if (code >= 80 && code <= 82) {
            iconClass = 'fa-cloud-showers-heavy';
            colorClass = 'weather-icon-rain';
            desc = 'Buien';
        } else if (code >= 95) {
            iconClass = 'fa-bolt';
            colorClass = 'weather-icon-storm';
            desc = 'Onweer';
        } else {
            iconClass = 'fa-question-circle';
            colorClass = 'weather-icon-cloud';
            desc = 'Onbekend';
        }

        weatherContent.innerHTML = `
            <div class="weather-location-btn" onclick="changeWeatherLocation()" title="Locatie wijzigen">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            
            <div class="weather-main">
                <i class="fas ${iconClass} weather-icon-large ${colorClass}"></i>
                <div class="weather-temp-large">${Math.round(temp)}°</div>
            </div>
            
            <div class="weather-desc-text">${desc}</div>
            
            <div class="weather-details">
                <div class="weather-detail-item">
                    <i class="fas fa-location-arrow"></i>
                    <span>${loc.name}</span>
                </div>
                <div class="weather-detail-item">
                    <i class="fas fa-wind"></i>
                    <span>${wind} km/h</span>
                </div>
            </div>
        `;
      } else {
        weatherContent.innerText = 'Weer informatie niet beschikbaar';
      }
    }catch(e){ weatherContent.innerText = 'Weer service niet bereikbaar'; }
  }

  window.changeWeatherLocation = () => {
      const modal = document.getElementById('weatherModal');
      if (modal) {
          modal.style.display = 'block';
          setTimeout(() => {
              const input = document.getElementById('weatherSearchInput');
              if (input) input.focus();
          }, 100);
          setupWeatherSearch();
      }
  };

  window.closeWeatherModal = () => {
      const modal = document.getElementById('weatherModal');
      if (modal) modal.style.display = 'none';
      const results = document.getElementById('weatherSearchResults');
      if (results) results.style.display = 'none';
      const input = document.getElementById('weatherSearchInput');
      if (input) input.value = '';
  };

  let weatherSearchInitialized = false;
  function setupWeatherSearch() {
      if (weatherSearchInitialized) return;
      weatherSearchInitialized = true;

      const input = document.getElementById('weatherSearchInput');
      const resultsBox = document.getElementById('weatherSearchResults');
      let debounceTimer;

      if (input && resultsBox) {
          input.addEventListener('input', (e) => {
              clearTimeout(debounceTimer);
              const query = e.target.value;
              
              if (query.length < 3) {
                  resultsBox.style.display = 'none';
                  return;
              }

              debounceTimer = setTimeout(async () => {
                  try {
                      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=nl&format=json`);
                      const data = await res.json();
                      
                      if (data.results && data.results.length > 0) {
                          resultsBox.innerHTML = data.results.map(r => `
                              <div style="padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));" 
                                   onclick="applyWeatherLocation('${r.name}', ${r.latitude}, ${r.longitude})">
                                  <div style="font-weight: 600;">${r.name}</div>
                                  <div style="font-size: 0.85rem; opacity: 0.7;">${r.admin1 || ''}, ${r.country || ''}</div>
                              </div>
                          `).join('');
                          resultsBox.style.display = 'block';
                      } else {
                          resultsBox.style.display = 'none';
                      }
                  } catch (err) {
                      console.error('Geo search error', err);
                  }
              }, 500);
          });

          // Close results when clicking outside
          document.addEventListener('click', (e) => {
              if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
                  resultsBox.style.display = 'none';
              }
          });
      }
  }

  window.applyWeatherLocation = (name, lat, lon) => {
      const newLoc = { name, lat, lon };
      localStorage.setItem('weather_location', JSON.stringify(newLoc));
      loadWeather();
      closeWeatherModal();
  };
          alert('Fout bij zoeken naar stad.');
      }
  };

  // System Status Widget
  async function loadSystemStatus() {
    const statusWidget = document.getElementById('systemStatusWidget');
    const statusContent = document.getElementById('systemStatusContent');
    if (!statusWidget || !statusContent) return;

    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.ok) {
            const uptimeHours = (data.uptime / 3600).toFixed(1);
            const memUsed = (data.memory.rss / 1024 / 1024).toFixed(0);
            
            statusContent.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><i class="fas fa-clock"></i> ${window.t ? window.t('uptime') : 'Uptime'}:</span>
                    <strong>${uptimeHours} uur</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><i class="fas fa-memory"></i> ${window.t ? window.t('memory') : 'Geheugen'}:</span>
                    <strong>${memUsed} MB</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span><i class="fas fa-server"></i> ${window.t ? window.t('status') : 'Status'}:</span>
                    <strong style="color: #2ecc71;">${window.t ? window.t('status_online') : 'Online'}</strong>
                </div>
            `;
        }
    } catch (e) {
        statusContent.innerHTML = `<span style="color: red;">${window.t ? window.t('status_offline') : 'Offline'}</span>`;
    }
  }

  // Printer Widget
  async function loadPrinterStatus() {
    const printerWidget = document.getElementById('printerWidget');
    const printerContent = document.getElementById('printerContent');
    if (!printerWidget || !printerContent) return;

    try {
        const devices = await fetchDevices();
        const printer = devices.find(d => d.type === 'printer');

        if (printer) {
            printerWidget.style.display = 'block';
            
            if (printer.state && printer.state.inks && printer.state.inks.length > 0) {
                let inkHtml = '<div class="ink-level-container">';
                printer.state.inks.forEach(ink => {
                  // Support standard single-color cartridges and multi-component (tri-color) cartridges.
                  if (ink.components && typeof ink.components === 'object') {
                    // components example: { C: 80, M: 60, Y: 50 }
                    inkHtml += `<div class="ink-cartridge">
                      <div class="ink-bar-wrapper tri-components">
                        ${['C','M','Y'].map(c => {
                          const lvl = ink.components[c] != null ? ink.components[c] : 0;
                          const col = c === 'C' ? '#00FFFF' : c === 'M' ? '#FF00FF' : '#FFFF00';
                          return `<div class="tri-bar" style="height:${lvl}%; background:${col};" title="${c}: ${lvl}%"></div>`;
                        }).join('')}
                      </div>
                      <div class="ink-label">${ink.label || ink.color || 'Tri-color'}</div>
                    <div style="font-size: 0.7em;">${Object.keys(ink.components).map(k => k + ': ' + ink.components[k] + '%').join(' • ')}</div>
                    </div>`;
                  } else {
                    let colorCode = '#000';
                    let label = ink.color;
                    if (ink.color === 'C') { colorCode = '#00FFFF'; label = window.t ? window.t('ink_cyan') : 'Cyaan'; }
                    else if (ink.color === 'M') { colorCode = '#FF00FF'; label = window.t ? window.t('ink_magenta') : 'Magenta'; }
                    else if (ink.color === 'Y') { colorCode = '#FFFF00'; label = window.t ? window.t('ink_yellow') : 'Geel'; }
                    else if (ink.color === 'K') { colorCode = '#000000'; label = window.t ? window.t('ink_black') : 'Zwart'; }
                        
                    inkHtml += `
                      <div class="ink-row">
                        <div class="ink-info">
                            <span class="ink-label">${label}</span>
                            <span class="ink-percent">${ink.level}%</span>
                        </div>
                        <div class="ink-track">
                          <div class="ink-fill" style="width: ${ink.level}%; background-color: ${colorCode};"></div>
                        </div>
                      </div>
                    `;
                  }
                });
                inkHtml += '</div>';
                printerContent.innerHTML = inkHtml;
            } else {
                printerContent.innerHTML = `<div style="text-align: center; padding: 10px;">${window.t ? window.t('fetching_ink') : 'Inktstatus ophalen...'}</div>`;
            }
        } else {
            printerWidget.style.display = 'none';
        }
    } catch (e) {
        console.error('Error loading printer status:', e);
    }
  }

  async function runDownloadTest(){
    // Use Cloudflare speedtest endpoint (HTTPS, CORS enabled) to test actual Internet speed
    // instead of local network speed
    const size = 10000000; // 10MB
    const url = `https://speed.cloudflare.com/__down?bytes=${size}`;
    
    const startPing = performance.now();
    const resp = await fetch(url);
    const endPing = performance.now();
    const ping = Math.round(endPing - startPing); // TTFB as rough ping

    if(!resp.ok) throw new Error('Speedtest request failed');
    
    const reader = resp.body.getReader();
    let received = 0;
    const startDl = performance.now();
    
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      received += value.length;
    }
    
    const duration = (performance.now() - startDl) / 1000;
    const mbps = (received * 8) / (duration * 1000000);
    
    return { mbps: mbps.toFixed(2), bytes: received, secs: duration.toFixed(2), ping };
  }

  function getSpeedEvaluation(mbps) {
      const speed = parseFloat(mbps);
      if (speed > 500) return { text: window.t ? window.t('speed_excellent') : 'Uitstekend (Fiber)', color: '#2ecc71' };
      if (speed > 100) return { text: window.t ? window.t('speed_very_good') : 'Zeer Goed', color: '#27ae60' };
      if (speed > 50) return { text: window.t ? window.t('speed_good') : 'Goed', color: '#f1c40f' };
      if (speed > 20) return { text: window.t ? window.t('speed_fair') : 'Redelijk', color: '#e67e22' };
      return { text: window.t ? window.t('speed_slow') : 'Traag', color: '#e74c3c' };
  }

  function renderSpeedResult(ping, mbps, dateStr) {
      if (!speedtestResults) return;
      const eval = getSpeedEvaluation(mbps);
        speedtestResults.innerHTML = `
          <div style="text-align: center; margin-top: 10px;">
              <div style="font-size: 2.5em; font-weight: bold; color: var(--text);">${mbps} <span style="font-size: 0.4em; color: var(--muted);">Mbps</span></div>
              <div style="color: ${eval.color}; font-weight: bold; margin-bottom: 5px;">${eval.text}</div>
              <div style="font-size: 0.9em; color: var(--muted);">Ping: ${ping} ms</div>
              ${dateStr ? `<div style="font-size: 0.8em; color: var(--muted); margin-top: 5px;">${window.t ? window.t('last_test') : 'Laatste test'}: ${dateStr}</div>` : ''}
          </div>
        `;
  }

  if (runSpeedtest) {
    // Load saved result
    const saved = localStorage.getItem('last_speedtest');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            renderSpeedResult(data.ping, data.mbps, new Date(data.ts).toLocaleString());
        } catch(e) {}
    }

    runSpeedtest.addEventListener('click', async ()=>{
      if (speedtestResults) speedtestResults.innerHTML = `<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin" style="font-size: 2em; color: var(--accent-color);"></i><div style="margin-top: 10px;">${window.t ? window.t('testing_speed') : 'Internet snelheid testen...'}</div></div>`;
      try{
        const dl = await runDownloadTest();
        
        const result = {
            ping: dl.ping,
            mbps: dl.mbps,
            ts: Date.now()
        };
        localStorage.setItem('last_speedtest', JSON.stringify(result));
        renderSpeedResult(dl.ping, dl.mbps, window.t ? window.t('just_now') : 'Zojuist');
        
      }catch(e){ 
          console.error(e);
          if (speedtestResults) speedtestResults.innerText = window.t ? window.t('speedtest_failed') : 'Speedtest mislukt (Check internet)'; 
      }
    });
  }

  // Scenes Logic moved to initializeScenesBar at end of file


  // Presence Logic
  async function loadPresence() {
      const el = document.getElementById('presenceContent');
      if(!el) return;
      try {
          const res = await apiGet('/api/presence');
          if(!res || !res.people) return;
          
          if(res.people.length === 0) {
              el.innerHTML = '<div class="empty">No users tracking</div>';
              return;
          }

          el.innerHTML = `<div class="presence-list">
            ${res.people.map(p => `
              <div class="person-item">
                  <div class="person-status ${p.isHome ? 'home' : 'away'}"></div>
                  <span>${p.name}</span>
                  <span style="margin-left:auto; font-size:0.8em; opacity:0.7">${p.isHome ? 'Thuis' : 'Afwezig'}</span>
              </div>
            `).join('')}
          </div>`;
      } catch(e) { console.error('Presence error', e); }
  }

  // Energy Logic
  async function loadEnergy() {
      const el = document.getElementById('energyContent');
      if(!el) return;
      try {
          const res = await apiGet('/api/energy'); 
          // Fix: The API returns the data object directly, not wrapped in a 'data' property
          const d = (res && res.data) ? res.data : res;
          
          if(!d || !d.grid || !d.solar) return;
          
          const gridClass = d.grid.currentPower > 0 ? 'pos' : (d.grid.currentPower < 0 ? 'neg' : '');
          
          el.innerHTML = `
            <div class="energy-grid">
                <div class="energy-item">
                    <div style="font-size:0.8em">Solar</div>
                    <div class="energy-val neg"><i class="fas fa-sun"></i> ${d.solar.currentPower} W</div>
                </div>
                <div class="energy-item">
                    <div style="font-size:0.8em">Grid</div>
                    <div class="energy-val ${gridClass}"><i class="fas fa-plug"></i> ${d.grid.currentPower} W</div>
                </div>
                <div class="energy-item" style="grid-column: span 2">
                    <div style="font-size:0.8em">Home</div>
                    <div class="energy-val pos"><i class="fas fa-home"></i> ${d.home.currentUsage} W</div>
                </div>
            </div>
          `;
      } catch(e) { console.error('Energy error', e); }
  }

  // initial
  // loadScenes();
  loadPresence();
  loadEnergy();
  setInterval(loadEnergy, 5000);
  setInterval(loadPresence, 60000);

  // AI Assistant
  const aiInput = document.getElementById('aiInput');
  const aiSubmit = document.getElementById('aiSubmit');
  
  async function submitAI() {
    const text = aiInput.value.trim();
    if(!text) return;
    
    // Show some loading state
    const originalIcon = aiSubmit.innerHTML;
    aiSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch('/api/ai/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }) 
        });
        const data = await res.json();
        if (data.message && typeof showToast === 'function') {
            showToast(data.message, data.ok ? 'success' : 'error');
        } else if (data.message) {
            alert(data.message);
        }

        if (data.ok) {
            aiInput.value = '';
            render(); // Refresh state
        }
    } catch(e) {
        console.error(e);
    } finally {
        aiSubmit.innerHTML = originalIcon;
    }
  }

  if(aiSubmit) {
      aiSubmit.addEventListener('click', submitAI);
      aiInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') submitAI();
      });
  }
  
  window.addEventListener('translationsLoaded', () => {
      if (roomsList) render();
      loadSystemStatus(); // Also reload widgets that use translation
  });

  if (roomsList) render();
  loadWeather();
  loadPrinterStatus();
  loadSystemStatus();
  
  // Scenes Bar Initialization - Fixed Duplicate Function Name
  const scenesBarContainer = document.getElementById('scenesBar');
  if (scenesBarContainer) {
      async function initializeScenesBar() {
          try {
                let scenes = [];
                try {
                    scenes = await apiGet('/api/scenes');
                    if (scenes && scenes.scenes) scenes = scenes.scenes; // Handle wrapper object
                } catch(e) { console.warn('Using default scenes'); }

                // Default Scenes Fallback
                if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
                     scenes = [
                        { id: 'HOME', name: 'Home', icon: 'fas fa-home', color: '#3b82f6' },
                        { id: 'AWAY', name: 'Away', icon: 'fas fa-sign-out-alt', color: '#64748b' },
                        { id: 'CINEMA', name: 'Cinema', icon: 'fas fa-video', color: '#ef4444' },
                        { id: 'NIGHT', name: 'Night', icon: 'fas fa-moon', color: '#8b5cf6' },
                        { id: 'MORNING', name: 'Morning', icon: 'fas fa-coffee', color: '#f59e0b' }
                    ];
                }
                
                scenesBarContainer.innerHTML = '';
                scenesBarContainer.classList.add('scenes-scroll-container');
                
                scenes.forEach(scene => {
                    const btn = document.createElement('div');
                    btn.className = 'scene-chip';
                    const iconColor = scene.color || '#fff';
                    // Support both font-awesome class strings and simple names
                    const iconClass = scene.icon.startsWith('fa') ? scene.icon : `fas ${scene.icon}`;

                    btn.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}"></i> <span>${scene.name}</span>`;
                    
                    btn.onclick = async () => {
                         btn.classList.add('active');
                         setTimeout(() => btn.classList.remove('active'), 300);
                         try {
                            // Support both new (sceneId) and old (mode) APIs
                            await fetch(`/api/scenes/${scene.id}`, { method: 'POST' });
                         } catch (e) { 
                             // Fallback to legacy mode API if scene not found
                             console.warn('Scene activation failed, trying legacy mode set...');
                             try {
                                 await fetch('/api/mode/set', {
                                     method: 'POST',
                                     headers: { 'Content-Type': 'application/json' },
                                     body: JSON.stringify({ mode: scene.id })
                                 });
                             } catch(e2) {
                                 console.error('All activation attempts failed');
                             }
                        }
                    };
                    scenesBarContainer.appendChild(btn);
                });
          } catch (e) { console.error('Scenes bar init error:', e); }
      }
      initializeScenesBar();
  }

  setInterval(loadPrinterStatus, 10000); // Poll printer every 10s
  setInterval(loadSystemStatus, 30000); // Poll system status every 30s
  // subscribe to server events to refresh widgets when rooms/mapping change
  if (typeof EventSource !== 'undefined'){
    try{
      const es = new EventSource('/events');
      es.addEventListener('rooms-changed', (e)=>{ render(); });
    }catch(e){ /* ignore */ }
  }

  // Listen for real-time device updates via WebSocket
  document.addEventListener('device-update', (e) => {
      render();
  });

  // Clock Widget
  function updateClock() {
      const now = new Date();
      const timeEl = document.getElementById('clockTime');
      const dateEl = document.getElementById('clockDate');
      if (timeEl && dateEl) {
          timeEl.textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
          dateEl.textContent = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Polling fallback to ensure Dashboard is always up to date
  setInterval(() => {
      // Only refresh if user is not interacting with inputs
      const activeEl = document.activeElement;
      const inputs = ['INPUT', 'TEXTAREA', 'SELECT'];
      if (!activeEl || !inputs.includes(activeEl.tagName)) {
        if (typeof render === 'function') render();
      }
  }, 5000);
});

/* AI Assistant Logic */
document.addEventListener('DOMContentLoaded', () => {
    const aiInput = document.getElementById('aiInput');
    const aiSubmit = document.getElementById('aiSubmit');
    const aiMic = document.getElementById('aiMic');

    if (aiSubmit && aiInput) {
        async function sendAICommand() {
            const text = aiInput.value.trim();
            if (!text) return;
            
            aiInput.value = '';
            const originalPlaceholder = aiInput.placeholder;
            aiInput.placeholder = 'Thinking...';
            
            try {
                const res = await fetch('/api/ai/command', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ text })
                });
                const data = await res.json();
                
                if (data.ok) {
                    // Feedback via placeholder or alert
                    aiInput.placeholder = data.message || 'Done';
                    setTimeout(() => aiInput.placeholder = originalPlaceholder, 3000);
                } else {
                     aiInput.placeholder = 'Error: ' + data.message;
                     setTimeout(() => aiInput.placeholder = originalPlaceholder, 3000);
                }
            } catch (e) {
                console.error(e);
                aiInput.placeholder = 'Connection Failed';
            }
        }

        aiSubmit.addEventListener('click', sendAICommand);
        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAICommand();
        });
        
        // Voice Control
        if (aiMic && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'en-US'; 
            
            recognition.onstart = () => {
                aiMic.style.color = '#ef4444';
            };
            recognition.onend = () => {
                aiMic.style.color = '';
            };
            recognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                aiInput.value = text;
                sendAICommand();
            };
            
            aiMic.onclick = () => recognition.start();
        } else if (aiMic) {
            aiMic.style.display = 'none'; 
        }
    }
});
