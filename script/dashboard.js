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
      roomEl.className = 'room-card';
      const devs = Object.keys(map).filter(k => map[k] === r.id).map(id => deviceById[id]).filter(Boolean);

      roomEl.innerHTML = `
        <div class="room-header">
          <h4>${r.name}</h4>
          <div class="room-actions">
            <button data-id="${r.id}" class="rename-room">✏️</button>
            <button data-id="${r.id}" class="delete-room">🗑️</button>
          </div>
        </div>
        <div class="room-devices">
          ${devs.length>0 ? devs.map(d=>`<div class="room-device"><i class="${typeof getDeviceIconClass === 'function' ? getDeviceIconClass(d) : 'fas fa-cube'}"></i> ${d.name} <button data-device="${d.id}" class="unassign">${window.t ? window.t('unassign') : 'Verwijder'}</button></div>`).join('') : '<div class="empty">Geen apparaten</div>'}
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

  // AI Assistant
  const aiInput = document.getElementById('aiInput');
  const aiSubmit = document.getElementById('aiSubmit');

  if (aiSubmit && aiInput) {
    const handleAI = async () => {
      const text = aiInput.value.trim();
      if (!text) return;
      
      aiSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const res = await fetch('/api/ai/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        if (data.ok) {
          alert(data.message); // Or show a nice toast
          aiInput.value = '';
        } else {
          alert((window.t ? window.t('ai_error') : 'AI Error') + ': ' + data.message);
        }
      } catch (e) {
        console.error(e);
      } finally {
        aiSubmit.innerHTML = '<i class="fas fa-magic"></i>';
      }
    };

    aiSubmit.addEventListener('click', handleAI);
    aiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAI();
    });
  }

  // Presence Widget
  async function updatePresence() {
    const el = document.getElementById('presenceContent');
    if (!el) return;
    
    try {
      const res = await fetch('/api/presence');
      const data = await res.json();
      
      if (data.people.length === 0) {
        el.innerHTML = `<div class="empty">${window.t ? window.t('no_people_tracked') : 'No people tracked'}</div>`;
        return;
      }

      el.innerHTML = `<div class="presence-list">
        ${data.people.map(p => `
          <div class="person-item">
            <div class="person-status ${p.isHome ? 'home' : 'away'}"></div>
            <span>${p.name}</span>
            <span style="margin-left:auto; font-size:0.8em; opacity:0.7">${p.isHome ? 'Home' : 'Away'}</span>
          </div>
        `).join('')}
      </div>`;
    } catch (e) {
      el.innerHTML = window.t ? window.t('error_loading_presence') : 'Error loading presence';
    }
  }

  // Energy Widget
  async function updateEnergy() {
    const el = document.getElementById('energyContent');
    if (!el) return;

    try {
      const res = await fetch('/api/energy');
      const data = await res.json();
      
      const gridPower = data.grid.currentPower || 0;
      const solarPower = data.solar.currentPower || 0;
      const usage = data.home.currentUsage || (gridPower + solarPower); // Estimate if not measured

      el.innerHTML = `
        <div class="energy-grid">
          <div class="energy-item">
            <i class="fas fa-home"></i>
            <div class="energy-val pos">${Math.round(usage)} W</div>
            <div style="font-size:0.8em">${window.t ? window.t('usage') : 'Usage'}</div>
          </div>
          <div class="energy-item">
            <i class="fas fa-solar-panel"></i>
            <div class="energy-val neg">${Math.round(solarPower)} W</div>
            <div style="font-size:0.8em">${window.t ? window.t('solar') : 'Solar'}</div>
          </div>
          <div class="energy-item" style="grid-column: span 2">
            <i class="fas fa-bolt"></i>
            <div class="energy-val ${gridPower > 0 ? 'pos' : 'neg'}">${Math.round(gridPower)} W</div>
            <div style="font-size:0.8em">${gridPower > 0 ? (window.t ? window.t('grid_import') : 'Grid (Import)') : (window.t ? window.t('grid_export') : 'Grid (Export)')}</div>
          </div>
        </div>
      `;
    } catch (e) {
      el.innerHTML = window.t ? window.t('error_loading_energy') : 'Error loading energy';
    }
  }

  // Initial calls
  updatePresence();
  updateEnergy();
  setInterval(updatePresence, 10000);
  setInterval(updateEnergy, 5000);

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

  window.changeWeatherLocation = async () => {
      const city = prompt('Voer stad in voor weerbericht:');
      if(!city) return;
      
      try {
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=nl&format=json`);
          const data = await res.json();
          
          if(data.results && data.results.length > 0) {
              const result = data.results[0];
              const newLoc = {
                  name: result.name,
                  lat: result.latitude,
                  lon: result.longitude
              };
              localStorage.setItem('weather_location', JSON.stringify(newLoc));
              loadWeather();
          } else {
              alert('Stad niet gevonden.');
          }
      } catch(e) {
          console.error(e);
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

  // Scenes Logic
  async function loadScenes() {
    const scenesBar = document.getElementById('scenesBar');
    if (!scenesBar) return;

    try {
      const data = await apiGet('/api/scenes');
      if (!data || !data.scenes) return;

      scenesBar.innerHTML = '';
      data.scenes.forEach(scene => {
        const card = document.createElement('div');
        card.className = `scene-card${scene.id === data.mode ? ' active' : ''}`;
        card.onclick = () => activateScene(scene.id);
        
        let icon = 'fa-home';
        if (scene.id === 'AWAY') icon = 'fa-shoe-prints';
        if (scene.id === 'NIGHT') icon = 'fa-moon';
        if (scene.id === 'CINEMA') icon = 'fa-film';

        card.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 5px;"><i class="fas ${icon}"></i></div>
            <div style="font-weight: 500;">${scene.name}</div>
        `;
        scenesBar.appendChild(card);
      });
    } catch(e) { console.error('Error loading scenes:', e); }
  }

  window.activateScene = async function(modeId) {
    try {
      await fetch('/api/mode/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: modeId })
      });
      loadScenes(); 
    } catch(e) { console.error('Failed to set scene:', e); }
  }

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
          if(!res || !res.data) return;
          const d = res.data;
          
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
  loadScenes();
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
  if (roomsList) render();
  loadWeather();
  loadPrinterStatus();
  loadSystemStatus();
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
});
