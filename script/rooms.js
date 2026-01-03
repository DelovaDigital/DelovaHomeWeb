document.addEventListener('DOMContentLoaded', () => {
  const roomsList = document.getElementById('roomsList');

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
    const headerAdd = document.getElementById('addRoomHeaderBtn');
    if(rooms.length === 0){
      // hide header add button when no rooms
      if(headerAdd) headerAdd.style.display = 'none';
      roomsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-message">Geen kamers.</div>
          <button id="createRoomEmptyBtn" class="btn-create-empty">Maak een kamer aan</button>
        </div>
      `;
      const emptyBtn = document.getElementById('createRoomEmptyBtn');
      if(emptyBtn) emptyBtn.addEventListener('click', async ()=>{
        try{
          if(typeof window.showRoomPicker === 'function'){
            const roomId = await window.showRoomPicker({ createOnly: true });
            if(roomId) render();
          } else {
            const name = prompt('Nieuwe kamer naam');
            if(name && name.trim()){
              await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
              render();
            }
          }
        }catch(e){ console.error('Failed to create room from empty-state', e); }
      });
      return;
    }

      // show header add button when rooms exist
      if(headerAdd){
        headerAdd.style.display = 'inline-block';
        headerAdd.onclick = async ()=>{
          try{
            if(typeof window.showRoomPicker === 'function'){
              const roomId = await window.showRoomPicker({ createOnly: true });
              if(roomId) render();
            } else {
              const name = prompt('Nieuwe kamer naam');
              if(name && name.trim()){
                await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
                render();
              }
            }
          }catch(e){ console.error(e); }
        };
      }

    // build unassigned list
    const assignedIds = Object.keys(map || {}).filter(k => map[k]);
    const unassigned = devices.filter(d => !assignedIds.includes(d.id));

    // render unassigned devices panel
    const unassignedPanel = document.createElement('div');
    unassignedPanel.className = 'unassigned-panel';
    unassignedPanel.innerHTML = `
      <strong>Niet-toegewezen apparaten</strong>
      <div class="unassigned-list">
        ${unassigned.length>0 ? unassigned.map(u=>`<div class="unassigned-item" draggable="true" data-device-id="${u.id}"><i class="${typeof getDeviceIconClass === 'function' ? getDeviceIconClass(u) : 'fas fa-cube'}"></i> ${u.name} <small>(${u.ip || 'n/a'})</small></div>`).join('') : '<div class="empty">Geen niet-toegewezen apparaten</div>'}
      </div>
    `;
    roomsList.appendChild(unassignedPanel);

    const gridContainer = document.createElement('div');
    gridContainer.className = 'rooms-grid';
    roomsList.appendChild(gridContainer);

    rooms.forEach(r => {
      const devs = Object.keys(map).filter(k => map[k] === r.id).map(id => deviceById[id]).filter(Boolean);

      const roomEl = document.createElement('div');
      roomEl.className = 'room-card';
      roomEl.innerHTML = `
        <div class="room-header">
          <h4>${r.name}</h4>
          <div class="room-actions">
            <button data-id="${r.id}" class="rename-room" title="Rename"><i class="fas fa-edit"></i></button>
            <button data-id="${r.id}" class="delete-room" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div class="room-stats">
            <span>${devs.length} Apparaten</span>
        </div>
        <div class="room-devices">
          ${devs.length>0 ? devs.map(d=>`<div class="room-device"><i class="${typeof getDeviceIconClass === 'function' ? getDeviceIconClass(d) : 'fas fa-cube'}"></i> <span>${d.name}</span> <button data-device="${d.id}" class="unassign" title="Remove"><i class="fas fa-times"></i></button></div>`).join('') : '<div class="empty">Geen apparaten</div>'}
        </div>
        <div class="room-add">
          <select class="add-select">
            <option value="">+ Apparaat toevoegen</option>
            ${unassigned.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}
          </select>
        </div>
      `;
      
      // Event listeners
      roomEl.querySelector('.rename-room').onclick = async () => {
        const newName = prompt('Nieuwe naam:', r.name);
        if(newName && newName !== r.name){
          await fetch(`/api/rooms/${r.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newName }) });
          render();
        }
      };
      
      roomEl.querySelector('.delete-room').onclick = async () => {
        if(confirm(`Kamer "${r.name}" verwijderen?`)){
          await fetch(`/api/rooms/${r.id}`, { method:'DELETE' });
          render();
        }
      };

      roomEl.querySelectorAll('.unassign').forEach(btn => {
        btn.onclick = async () => {
          const devId = btn.dataset.device;
          await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId: devId, roomId: null }) });
          render();
        };
      });

      const sel = roomEl.querySelector('.add-select');
      sel.onchange = async () => {
        if(sel.value){
          await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId: sel.value, roomId: r.id }) });
          render();
        }
      };

      // Drag & Drop Drop Target
      roomEl.addEventListener('dragover', (ev)=>{ ev.preventDefault(); roomEl.classList.add('drag-over'); });
      roomEl.addEventListener('dragleave', ()=>{ roomEl.classList.remove('drag-over'); });
      roomEl.addEventListener('drop', async (ev)=>{
        ev.preventDefault(); roomEl.classList.remove('drag-over');
        const deviceId = ev.dataTransfer.getData('text/plain');
        if(!deviceId) return;
        await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId: r.id }) });
        render();
      });

      gridContainer.appendChild(roomEl);
    });

    // Drag Start for Unassigned Items
    document.querySelectorAll('.unassigned-item').forEach(item => {
      item.addEventListener('dragstart', (ev)=>{
        ev.dataTransfer.setData('text/plain', item.getAttribute('data-device-id'));
      });
    });
  }

  render();
});
