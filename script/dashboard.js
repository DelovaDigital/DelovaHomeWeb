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

  createRoomBtn.addEventListener('click', async ()=>{
    const name = newRoomName.value && newRoomName.value.trim();
    if(!name) return alert('Vul een naam in');
    await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    newRoomName.value = '';
    render();
  });

  // Weather widget (Open-Meteo fallback location Amsterdam)
  async function loadWeather(){
    try{
      const lat = 52.3676, lon = 4.9041;
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
        .then(r => r.json());
      if(w && w.current_weather){
        weatherContent.innerHTML = `<div class="temp">${w.current_weather.temperature}°C</div><div>Wind ${w.current_weather.windspeed} km/h</div>`;
      } else {
        weatherContent.innerText = 'Weer informatie niet beschikbaar';
      }
    }catch(e){ weatherContent.innerText = 'Weer service niet bereikbaar'; }
  }

  async function runDownloadTest(sizeBytes = 5 * 1024 * 1024){
    const start = performance.now();
    const resp = await fetch(`/api/speedtest/file?size=${sizeBytes}`);
    const reader = resp.body.getReader();
    let received = 0;
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      received += value.length;
    }
    const duration = (performance.now() - start) / 1000;
    const mbps = (received * 8) / (duration * 1000 * 1000);
    return { mbps: mbps.toFixed(2), bytes: received, secs: duration.toFixed(2) };
  }

  runSpeedtest.addEventListener('click', async ()=>{
    speedtestResults.innerText = 'Running...';
    try{
      // ping
      const t0 = performance.now();
      await fetch('/api/speedtest/ping');
      const ping = Math.round(performance.now() - t0);

      const dl = await runDownloadTest();
      speedtestResults.innerHTML = `Ping: ${ping} ms<br>Download: ${dl.mbps} Mbps (${dl.bytes} bytes in ${dl.secs}s)`;
    }catch(e){ speedtestResults.innerText = 'Speedtest failed'; }
  });

  // initial
  render();
  loadWeather();
  // subscribe to server events to refresh widgets when rooms/mapping change
  if (typeof EventSource !== 'undefined'){
    try{
      const es = new EventSource('/events');
      es.addEventListener('rooms-changed', (e)=>{ render(); });
    }catch(e){ /* ignore */ }
  }
});
