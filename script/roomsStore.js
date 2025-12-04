const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DATA_FILE = path.join(__dirname, '..', 'data', 'rooms.json');
const emitter = new EventEmitter();

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { rooms: [], map: {} };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    // emit a change event to notify subscribers
    emitter.emit('rooms-changed', { rooms: data.rooms || [], map: data.map || {} });
  } catch (e) {
    console.error('Failed to write rooms data:', e);
    throw e;
  }
}

function generateId() {
  return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function getRooms() {
  const d = readData();
  return d.rooms || [];
}

function getMap() {
  const d = readData();
  return d.map || {};
}

function createRoom(name) {
  const d = readData();
  const room = { id: generateId(), name: String(name) };
  d.rooms = d.rooms || [];
  d.rooms.push(room);
  writeData(d);
  return room;
}

function renameRoom(id, name) {
  const d = readData();
  d.rooms = d.rooms || [];
  const r = d.rooms.find(x => x.id === id);
  if (!r) throw new Error('Room not found');
  r.name = String(name);
  writeData(d);
}

function deleteRoom(id) {
  const d = readData();
  d.rooms = (d.rooms || []).filter(x => x.id !== id);
  // remove mappings to this room
  d.map = d.map || {};
  for (const dev in d.map) {
    if (d.map[dev] === id) delete d.map[dev];
  }
  writeData(d);
}

function assignDevice(deviceId, roomId) {
  const d = readData();
  d.map = d.map || {};
  if (!roomId) {
    // unassign
    delete d.map[deviceId];
  } else {
    d.map[deviceId] = roomId;
  }
  writeData(d);
}

module.exports = { getRooms, createRoom, renameRoom, deleteRoom, getMap, assignDevice, events: emitter };
