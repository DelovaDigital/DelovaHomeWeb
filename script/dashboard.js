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
      return rooms;
    }catch(e){return []}
  }

  async function fetchMap(){
    try{ return await apiGet('/api/room-mapping'); }catch(e){ return {}; }
  }

  async function fetchDevices(){
    try{ return await apiGet('/api/devices'); }catch(e){ return []; }
  }

  async function render(){
    if(!roomsList) return; // page doesn't include rooms list -> nothing to render
    const [rooms, map, devices] = await Promise.all([fetchRooms(), fetchMap(), fetchDevices()]);
    const deviceById = {};
    devices.forEach(d => deviceById[d.id] = d);

    roomsList.innerHTML = '';
    if(rooms.length === 0){
      roomsList.innerHTML = '<div class="empty">Geen kamers. Maak er één aan.</div>';
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
          ${devs.length>0 ? devs.map(d=>`<div class="room-device">${d.name} <button data-device="${d.id}" class="unassign">Verwijder</button></div>`).join('') : '<div class="empty">Geen apparaten</div>'}
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
      if(!confirm('Kamer verwijderen?')) return;
      await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
      render();
    }));

    document.querySelectorAll('.rename-room').forEach(btn => btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      const name = prompt('Nieuwe naam voor kamer');
      if(name) {
        await fetch(`/api/rooms/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
        render();
      }
    }));
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', async ()=>{
      const name = newRoomName && newRoomName.value && newRoomName.value.trim();
      if(!name) return alert('Vul een naam in');
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
        
        let iconHtml = '';
        let desc = '';

        // WMO Weather interpretation codes (WW)
        if (code === 0) {
            iconHtml = '<div class="sun"></div>';
            desc = 'Zonnig';
        } else if (code >= 1 && code <= 3) {
            iconHtml = '<div class="cloud"></div>';
            if (code === 1) { iconHtml += '<div class="sun" style="left: 40px; top: -10px; width: 30px; height: 30px;"></div>'; desc = 'Licht bewolkt'; }
            else desc = 'Bewolkt';
        } else if (code >= 45 && code <= 48) {
            iconHtml = '<div class="cloud" style="background: #bdc3c7;"></div>';
            desc = 'Mist';
        } else if (code >= 51 && code <= 67) {
            iconHtml = '<div class="cloud" style="background: #7f8c8d;"></div><div class="rain-drop"></div><div class="rain-drop"></div><div class="rain-drop"></div>';
            desc = 'Regen';
        } else if (code >= 71 && code <= 77) {
            iconHtml = '<div class="cloud" style="background: #bdc3c7;"></div><div class="snowflake">❄</div><div class="snowflake" style="left: 20px; animation-delay: 1s;">❄</div>';
            desc = 'Sneeuw';
        } else if (code >= 80 && code <= 82) {
            iconHtml = '<div class="cloud" style="background: #34495e;"></div><div class="rain-drop"></div><div class="rain-drop"></div><div class="rain-drop"></div>';
            desc = 'Buien';
        } else if (code >= 95) {
            iconHtml = '<div class="cloud" style="background: #2c3e50;"></div><div style="position: absolute; bottom: -20px; left: 20px; color: #f1c40f; font-size: 20px;">⚡</div>';
            desc = 'Onweer';
        } else {
            iconHtml = '<div class="sun"></div>';
            desc = 'Onbekend';
        }

        weatherContent.style.position = 'relative';
        weatherContent.innerHTML = `
            <div style="position: absolute; top: 0; right: 0; cursor: pointer; color: #aaa; padding: 5px;" onclick="changeWeatherLocation()" title="Locatie wijzigen">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="weather-icon">${iconHtml}</div>
            <div class="weather-temp">${temp}°C</div>
            <div class="weather-desc">${desc}</div>
            <div style="font-size: 1em; font-weight: bold; margin-top: 8px; color: #444;">
                <i class="fas fa-location-arrow" style="font-size: 0.8em; margin-right: 5px;"></i>${loc.name}
            </div>
            <div style="font-size: 0.8em; color: #888; margin-top: 2px;">Wind: ${wind} km/h</div>
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
                    <span><i class="fas fa-clock"></i> Uptime:</span>
                    <strong>${uptimeHours} uur</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span><i class="fas fa-memory"></i> Geheugen:</span>
                    <strong>${memUsed} MB</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span><i class="fas fa-server"></i> Status:</span>
                    <strong style="color: #2ecc71;">Online</strong>
                </div>
            `;
        }
    } catch (e) {
        statusContent.innerHTML = '<span style="color: red;">Offline</span>';
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
                    if (ink.color === 'C') { colorCode = '#00FFFF'; label = 'Cyaan'; }
                    else if (ink.color === 'M') { colorCode = '#FF00FF'; label = 'Magenta'; }
                    else if (ink.color === 'Y') { colorCode = '#FFFF00'; label = 'Geel'; }
                    else if (ink.color === 'K') { colorCode = '#000000'; label = 'Zwart'; }
                        
                    inkHtml += `
                      <div class="ink-cartridge">
                        <div class="ink-bar-wrapper">
                          <div class="ink-bar" style="height: ${ink.level}%; background-color: ${colorCode};"></div>
                        </div>
                        <div class="ink-label">${label}</div>
                        <div style="font-size: 0.7em;">${ink.level}%</div>
                      </div>
                    `;
                  }
                });
                inkHtml += '</div>';
                printerContent.innerHTML = inkHtml;
            } else {
                printerContent.innerHTML = '<div style="text-align: center; padding: 10px;">Inktstatus ophalen...</div>';
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
      if (speed > 500) return { text: 'Uitstekend (Fiber)', color: '#2ecc71' };
      if (speed > 100) return { text: 'Zeer Goed', color: '#27ae60' };
      if (speed > 50) return { text: 'Goed', color: '#f1c40f' };
      if (speed > 20) return { text: 'Redelijk', color: '#e67e22' };
      return { text: 'Traag', color: '#e74c3c' };
  }

  function renderSpeedResult(ping, mbps, dateStr) {
      if (!speedtestResults) return;
      const eval = getSpeedEvaluation(mbps);
        speedtestResults.innerHTML = `
          <div style="text-align: center; margin-top: 10px;">
              <div style="font-size: 2.5em; font-weight: bold; color: var(--text);">${mbps} <span style="font-size: 0.4em; color: var(--muted);">Mbps</span></div>
              <div style="color: ${eval.color}; font-weight: bold; margin-bottom: 5px;">${eval.text}</div>
              <div style="font-size: 0.9em; color: var(--muted);">Ping: ${ping} ms</div>
              ${dateStr ? `<div style="font-size: 0.8em; color: var(--muted); margin-top: 5px;">Laatste test: ${dateStr}</div>` : ''}
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
      if (speedtestResults) speedtestResults.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin" style="font-size: 2em; color: var(--accent-color);"></i><div style="margin-top: 10px;">Internet snelheid testen...</div></div>';
      try{
        const dl = await runDownloadTest();
        
        const result = {
            ping: dl.ping,
            mbps: dl.mbps,
            ts: Date.now()
        };
        localStorage.setItem('last_speedtest', JSON.stringify(result));
        renderSpeedResult(dl.ping, dl.mbps, 'Zojuist');
        
      }catch(e){ 
          console.error(e);
          if (speedtestResults) speedtestResults.innerText = 'Speedtest mislukt (Check internet)'; 
      }
    });
  }

  // initial
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
});
