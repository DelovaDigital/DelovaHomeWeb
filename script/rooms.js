document.addEventListener('DOMContentLoaded', () => {
  const roomsList = document.getElementById('roomsList');
  const newRoomName = document.getElementById('newRoomName');
  const createRoomBtn = document.getElementById('createRoomBtn');

  async function apiGet(path){
    const res = await fetch(path);
    return res.json();
  }

  async function fetchRooms(){ try { return await apiGet('/api/rooms'); } catch(e){ return []; } }
  async function fetchMap(){ try { return await apiGet('/api/room-mapping'); } catch(e){ return {}; } }
  async function fetchDevices(){ try { return await apiGet('/api/devices'); } catch(e){ return []; } }

  async function render(){
    const [rooms, map, devices] = await Promise.all([fetchRooms(), fetchMap(), fetchDevices()]);
    const deviceById = {};
    devices.forEach(d => deviceById[d.id] = d);

    roomsList.innerHTML = '';
    if(rooms.length === 0){ roomsList.innerHTML = '<div class="empty">Geen kamers. Maak er één aan.</div>'; return; }

    // build unassigned list
    const assignedIds = Object.keys(map || {}).filter(k => map[k]);
    const unassigned = devices.filter(d => !assignedIds.includes(d.id));

    // render unassigned devices panel
    const unassignedPanel = document.createElement('div');
    unassignedPanel.className = 'unassigned-panel';
    unassignedPanel.innerHTML = `
      <strong>Ongeïncippeerde apparaten</strong>
      <div class="unassigned-list">
        ${unassigned.length>0 ? unassigned.map(u=>`<div class="unassigned-item" draggable="true" data-device-id="${u.id}">${u.name} <small>(${u.ip || 'n/a'})</small></div>`).join('') : '<div class="empty">Geen ongeïncippeerde apparaten</div>'}
      </div>
    `;
    roomsList.appendChild(unassignedPanel);

    rooms.forEach(r => {
      const devs = Object.keys(map).filter(k => map[k] === r.id).map(id => deviceById[id]).filter(Boolean);

      const roomEl = document.createElement('div');
      roomEl.className = 'room-card';
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
        <div class="room-add">
          <label>Ongeïncippeerde apparaten toevoegen</label>
          <select class="add-select">
            <option value="">-- Kies apparaat --</option>
            ${unassigned.map(u=>`<option value="${u.id}">${u.name} (${u.ip || 'n/a'})</option>`).join('')}
          </select>
          <button class="btn-add">Toevoegen</button>
        </div>
      `;

      roomsList.appendChild(roomEl);
    });

    // drag & drop handlers for unassigned items
    document.querySelectorAll('.unassigned-item').forEach(item => {
      item.addEventListener('dragstart', (ev)=>{
        ev.dataTransfer.setData('text/plain', item.getAttribute('data-device-id'));
      });
    });

    // make room cards drop targets
    document.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('dragover', (ev)=>{ ev.preventDefault(); card.classList.add('drag-over'); });
      card.addEventListener('dragleave', ()=>{ card.classList.remove('drag-over'); });
      card.addEventListener('drop', async (ev)=>{
        ev.preventDefault(); card.classList.remove('drag-over');
        const deviceId = ev.dataTransfer.getData('text/plain');
        const roomId = card.querySelector('.rename-room').getAttribute('data-id');
        if(!deviceId) return;
        await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId }) });
        render();
      });
    });

    // handlers
    document.querySelectorAll('.unassign').forEach(btn => btn.addEventListener('click', async ()=>{
      const deviceId = btn.getAttribute('data-device');
      await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId: null }) });
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
      if(name) { await fetch(`/api/rooms/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) }); render(); }
    }));

    document.querySelectorAll('.btn-add').forEach((btn, idx) => btn.addEventListener('click', async (e)=>{
      const parent = btn.parentElement;
      const sel = parent.querySelector('.add-select');
      const deviceId = sel.value;
      const roomCard = parent.closest('.room-card');
      const roomId = roomCard.querySelector('.rename-room').getAttribute('data-id');
      if(!deviceId) return alert('Kies eerst een apparaat');
      await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId }) });
      render();
    }));
  }

  createRoomBtn.addEventListener('click', async ()=>{
    const name = newRoomName.value && newRoomName.value.trim();
    if(!name) return alert('Vul een naam in');
    await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    newRoomName.value = '';
    render();
  });

  render();
});
