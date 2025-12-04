// Small helper to allow assigning a device to a room from devices page
window.assignDeviceToRoom = async function(deviceId){
  try{
    if(typeof showRoomPicker !== 'function'){
      alert('Room picker niet beschikbaar');
      return;
    }
    const roomId = await showRoomPicker(deviceId); // returns string id or null
    // user canceled -> roomId === null (we treat cancel same as no action). The modal resolves null also on cancel; however creation/unassign result may be null too.
    // We will still call API to unassign if empty string selected -> pass null
    if(roomId === undefined) return;
    await fetch('/api/room-mapping', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deviceId, roomId }) });
    alert('Toewijzing opgeslagen');
  }catch(e){
    console.error('Assign failed', e);
    alert('Kon apparaat niet toewijzen');
  }
};
