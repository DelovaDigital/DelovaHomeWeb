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

  // allow Enter in the input to trigger save (same as clicking Opslaan)
  if(newInput){
    newInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        e.preventDefault();
        btnSave.click();
      }
    });
  }

  let currentResolve = null;
  let currentOptions = {};

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
    document.body.style.overflow = '';
    if(currentResolve) { currentResolve(null); currentResolve = null; }
  });

  btnSave.addEventListener('click', async ()=>{
    const newName = newInput.value && newInput.value.trim();
    try{
        if(currentOptions.createOnly){
        if(!newName){
          alert(window.t ? window.t('enter_room_name') : 'Vul een naam in voor de nieuwe kamer');
          return;
        }
        // create new room and return its id
        const res = await fetch('/api/rooms', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: newName }) });
        let roomId = null;
        try{ const data = await res.json(); if(data && data.room && data.room.id) roomId = data.room.id; }catch(e){}
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        if(currentResolve) { currentResolve(roomId); currentResolve = null; }
        newInput.value = '';
        return;
      }

      // normal mode: allow selecting existing or creating new
      let roomId = selectEl.value || null;
      if(newName){
        const res = await fetch('/api/rooms', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: newName }) });
        const data = await res.json();
        if(data && data.room && data.room.id) roomId = data.room.id;
      }
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      if(currentResolve) { currentResolve(roomId); currentResolve = null; }
      newInput.value = '';
    }catch(e){
      console.error('Modal: save failed', e);
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      if(currentResolve) { currentResolve(null); currentResolve = null; }
    }
  });

  // click outside to close
  overlay.addEventListener('click', (ev)=>{
    if(ev.target === overlay){ 
      overlay.style.display = 'none'; 
      document.body.style.overflow = '';
      if(currentResolve){ currentResolve(null); currentResolve = null; } 
    }
  });

  // close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && overlay.style.display === 'flex'){
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      if(currentResolve){ currentResolve(null); currentResolve = null; }
    }
  });

  window.showRoomPicker = async function(arg){
    // Accept either deviceId string (legacy) or options object { createOnly: true }
    const opts = {};
    if(typeof arg === 'string') opts.deviceId = arg;
    if(typeof arg === 'object') Object.assign(opts, arg || {});
    currentOptions = opts;
    await loadRooms();

    // adjust UI for create-only mode
    const title = overlay.querySelector('h3');
    const labelExisting = selectEl.previousElementSibling; // the label node
    const spacer = selectEl.nextElementSibling; // spacer div
    if(opts.createOnly){
      if(title) title.textContent = 'Nieuwe kamer aanmaken';
      if(labelExisting) labelExisting.style.display = 'none';
      if(selectEl) { selectEl.style.display = 'none'; selectEl.value = ''; }
      if(spacer) spacer.style.display = 'none';
      newInput.value = '';
      newInput.focus();
    }else{
      if(title) title.textContent = 'Kies kamer';
      if(labelExisting) labelExisting.style.display = 'block';
      if(selectEl) selectEl.style.display = 'block';
      if(spacer) spacer.style.display = 'block';
    }

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    return new Promise((resolve, reject)=>{ currentResolve = resolve; });
  };

})();
