// Shared modal for selecting/creating rooms. Exposes `showRoomPicker(deviceId)` which returns a Promise that resolves to roomId (string) or null (unassigned) or rejects on cancel.
(function(){
  function buildModal(){
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Kies kamer</h3>
        <div class="modal-body">
          <label>Bestande kamers</label>
          <select id="roomPickerSelect">
            <option value="">-- Geen (ontkoppel) --</option>
          </select>
          <div style="height:8px"></div>
          <label>Of maak nieuwe kamer</label>
          <input id="roomPickerNew" placeholder="Nieuwe kamer naam" />
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" id="roomPickerCancel">Annuleer</button>
          <button class="btn-primary" id="roomPickerSave">Opslaan</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  const overlay = buildModal();
  const selectEl = overlay.querySelector('#roomPickerSelect');
  const newInput = overlay.querySelector('#roomPickerNew');
  const btnCancel = overlay.querySelector('#roomPickerCancel');
  const btnSave = overlay.querySelector('#roomPickerSave');

  let currentResolve = null;

  async function loadRooms(){
    try{
      const res = await fetch('/api/rooms');
      const rooms = await res.json();
      // clear
      selectEl.innerHTML = '<option value="">-- Geen (ontkoppel) --</option>' + (rooms.map(r=>`<option value="${r.id}">${r.name}</option>`).join(''));
    }catch(e){
      selectEl.innerHTML = '<option value="">-- Geen kamers (fout) --</option>';
    }
  }

  btnCancel.addEventListener('click', ()=>{
    overlay.style.display = 'none';
    if(currentResolve) { currentResolve(null); currentResolve = null; }
  });

  btnSave.addEventListener('click', async ()=>{
    // if new name provided, create room first
    const newName = newInput.value && newInput.value.trim();
    let roomId = selectEl.value || null;
    try{
      if(newName){
        const res = await fetch('/api/rooms', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: newName }) });
        const data = await res.json();
        if(data && data.room && data.room.id) roomId = data.room.id;
      }
      overlay.style.display = 'none';
      if(currentResolve) { currentResolve(roomId); currentResolve = null; }
      // reset fields
      newInput.value = '';
    }catch(e){
      console.error('Modal: save failed', e);
      overlay.style.display = 'none';
      if(currentResolve) { currentResolve(null); currentResolve = null; }
    }
  });

  // click outside to close
  overlay.addEventListener('click', (ev)=>{
    if(ev.target === overlay){ overlay.style.display = 'none'; if(currentResolve){ currentResolve(null); currentResolve = null; } }
  });

  window.showRoomPicker = async function(deviceId){
    await loadRooms();
    overlay.style.display = 'flex';
    return new Promise((resolve, reject)=>{ currentResolve = resolve; });
  };

})();
