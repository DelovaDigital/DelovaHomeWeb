let automations = [];
let devices = [];
let currentActions = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Load navigation
    const nav = document.querySelector('.main-nav');
    if (nav) {
        // Simple nav injection if not handled by script.js
    }
    
    await loadDevices();
    await loadAutomations();
    
    // Observer to hide empty message in modal
    const list = document.getElementById('actionsList');
    // Observer is a backup if renderActions doesn't handle it, but renderActions will handle it.
});

async function loadDevices() {
    try {
        const res = await fetch('/api/devices');
        if (!res.ok) throw new Error('Failed to fetch devices');
        devices = await res.json();
        
        if (!Array.isArray(devices)) devices = [];
        
        console.log(`[Automations] Loaded ${devices.length} devices.`);

        // Populate device dropdowns
        const stateDevice = document.getElementById('stateDevice');
        if (stateDevice) {
            stateDevice.innerHTML = devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        }
        
        // Re-render actions if modal is open to update dropdowns
        if (document.getElementById('automationModal').style.display === 'block') {
            renderActions();
        }
    } catch (e) {
        console.error('Error loading devices:', e);
        devices = [];
    }
}

async function loadAutomations() {
    const list = document.getElementById('automations-list');
    try {
        const res = await fetch('/api/automations');
        automations = await res.json();
        
        if (automations.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Geen automatiseringen gevonden. Maak er een aan!</div>';
            return;
        }

        list.innerHTML = automations.map(a => `
            <div class="automation-card">
                <div class="automation-info">
                    <h3>${a.name}</h3>
                    <div class="automation-desc">${getTriggerDescription(a.trigger)} &rarr; ${a.actions.length} Actie(s)</div>
                </div>
                <div class="automation-actions">
                    <button class="btn-icon" onclick="editAutomation('${a.id}')" title="Bewerken"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteAutomation('${a.id}')" title="Verwijderen" style="color: var(--danger);"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<div style="color: red; text-align: center;">Fout bij laden: ${e.message}</div>`;
    }
}

function getTriggerDescription(t) {
    if (t.type === 'presence') {
        return t.event === 'leave_home' ? 'Bij verlaten huis' : 'Bij thuiskomst';
    } else if (t.type === 'time') {
        if (!t.cron) return 'Tijd: Onbekend';
        const parts = t.cron.split(' ');
        if (parts.length >= 5 && parts.slice(parts.length - 3).every(p => p === '*')) {
            let h, m;
            if (parts.length === 5) {
                m = parts[0]; h = parts[1];
            } else if (parts.length === 6) {
                m = parts[1]; h = parts[2];
            }
            if (!isNaN(h) && !isNaN(m)) {
                const pad = (n) => n.toString().padStart(2, '0');
                return `Tijd: ${pad(h)}:${pad(m)}`;
            }
        }
        return `Tijd: ${t.cron}`;
    } else if (t.type === 'state') {
        const d = devices.find(dev => dev.id === t.deviceId);
        return `Als ${d ? d.name : t.deviceId} ${t.property} == ${t.value}`;
    } else if (t.type === 'weather') {
        return `Weer: ${t.condition} in ${t.location}`;
    }
    return 'Onbekend';
}

// --- Helper Logic for New UI ---

document.addEventListener('DOMContentLoaded', () => {
    // Weather condition change
    const weatherCond = document.getElementById('weatherCondition');
    if (weatherCond) {
        weatherCond.addEventListener('change', (e) => {
            const val = e.target.value;
            const valueGroup = document.getElementById('weatherValueGroup');
            if (valueGroup) {
                valueGroup.style.display = (val === 'temp_above' || val === 'temp_below') ? 'block' : 'none';
            }
        });
    }

    // Location Autocomplete
    const locationInput = document.getElementById('weatherLocation');
    const resultsBox = document.getElementById('locationResults');
    let debounceTimer;

    if (locationInput && resultsBox) {
        locationInput.addEventListener('input', (e) => {
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
                            <div class="search-result" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border);" 
                                 onclick="selectLocation('${r.name}', ${r.latitude}, ${r.longitude}, '${r.country || ''}')">
                                <strong>${r.name}</strong> <small style="color: var(--text-muted);">${r.admin1 || ''}, ${r.country || ''}</small>
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
            if (!locationInput.contains(e.target) && !resultsBox.contains(e.target)) {
                resultsBox.style.display = 'none';
            }
        });
    }
});

window.selectLocation = (name, lat, lon, country) => {
    document.getElementById('weatherLocation').value = name;
    document.getElementById('weatherLat').value = lat;
    document.getElementById('weatherLon').value = lon;
    document.getElementById('locationResults').style.display = 'none';
};

window.selectTriggerType = (type, element) => {
    // Update hidden input
    const input = document.getElementById('triggerType');
    if(input) input.value = type;
    
    // Visual update
    document.querySelectorAll('.trigger-card').forEach(el => {
        el.classList.remove('active');
        // If element is not provided (programmatic call), match by onclick text
        if (!element) {
             const onClickAttr = el.getAttribute('onclick');
             if (onClickAttr && onClickAttr.includes(`'${type}'`)) {
                 el.classList.add('active');
             }
        }
    });
    
    if (element) {
        element.classList.add('active');
    }
    
    // Call existing logic
    updateTriggerFields();
};

window.updateCronFromTime = (val) => {
    if(!val) return;
    const [h, m] = val.split(':');
    // Simple daily cron: m h * * *
    document.getElementById('timeCron').value = `${parseInt(m)} ${parseInt(h)} * * *`;
};

// --- Modal Logic ---

window.openAutomationModal = () => {
    document.getElementById('automationModal').style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Nieuwe Automatisering';
    document.getElementById('automationId').value = '';
    document.getElementById('autoName').value = '';
    
    // Reset to presence
    selectTriggerType('presence');
    
    currentActions = [];
    renderActions();
};

window.closeAutomationModal = () => {
    document.getElementById('automationModal').style.display = 'none';
};

window.updateTriggerFields = () => {
    const type = document.getElementById('triggerType').value;
    document.querySelectorAll('.trigger-group').forEach(el => el.style.display = 'none');
    const target = document.getElementById(`trigger-${type}`);
    if(target) target.style.display = 'block';
};

window.editAutomation = (id) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;

    openAutomationModal();
    document.getElementById('modalTitle').textContent = 'Automatisering Bewerken';
    document.getElementById('automationId').value = auto.id;
    document.getElementById('autoName').value = auto.name;
    
    // Set trigger type visually and logically
    if(auto.trigger && auto.trigger.type) {
        selectTriggerType(auto.trigger.type);
    }
    
    // Set field values
    if (auto.trigger.type === 'presence') {
        document.getElementById('presenceEvent').value = auto.trigger.event;
    } else if (auto.trigger.type === 'time') {
        document.getElementById('timeCron').value = auto.trigger.cron;
        // Try to reverse engineer time input
        // "min hour * * *"
        const parts = auto.trigger.cron.split(' ');
        if(parts.length >= 5) {
             let m = parts[0];
             let h = parts[1];
             // handle 6 parts
             if(parts.length === 6) { m = parts[1]; h = parts[2]; }
             
             if(!isNaN(m) && !isNaN(h)) {
                 const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
                 const timeInput = document.getElementById('timeInput');
                 if(timeInput) timeInput.value = timeStr;
             }
        }
    } else if (auto.trigger.type === 'state') {
        document.getElementById('stateDevice').value = auto.trigger.deviceId;
        document.getElementById('stateProperty').value = auto.trigger.property;
        document.getElementById('stateValue').value = auto.trigger.value;
    } else if (auto.trigger.type === 'weather') {
        document.getElementById('weatherCondition').value = auto.trigger.condition;
        document.getElementById('weatherLocation').value = auto.trigger.location;
        document.getElementById('weatherLat').value = auto.trigger.lat;
        document.getElementById('weatherLon').value = auto.trigger.lon;
        if (auto.trigger.value) document.getElementById('weatherValue').value = auto.trigger.value;
        
        // Trigger generic change event to update UI visibility
        const event = new Event('change');
        document.getElementById('weatherCondition').dispatchEvent(event);
    }

    currentActions = JSON.parse(JSON.stringify(auto.actions));
    renderActions();
};

window.deleteAutomation = async (id) => {
    if (!confirm('Weet je zeker dat je deze automatisering wilt verwijderen?')) return;
    
    try {
        await fetch(`/api/automations/${id}`, { method: 'DELETE' });
        loadAutomations();
    } catch (e) {
        alert('Fout bij verwijderen: ' + e.message);
    }
};

// --- Action Logic ---

window.addDeviceAction = () => {
    currentActions.push({
        type: 'device',
        deviceId: devices[0]?.id || '',
        command: 'turn_on',
        value: null
    });
    renderActions();
};

window.addDelayAction = () => {
    currentActions.push({
        type: 'delay',
        duration: 1000
    });
    renderActions();
};

window.removeAction = (index) => {
    currentActions.splice(index, 1);
    renderActions();
};

window.updateAction = (index, field, value) => {
    currentActions[index][field] = value;
};

function renderActions() {
    const container = document.getElementById('actionsList');
    if(!container) return;
    
    container.innerHTML = currentActions.map((action, index) => {
        if (action.type === 'device') {
            const deviceOptions = devices.map(d => `<option value="${d.id}" ${d.id === action.deviceId ? 'selected' : ''}>${d.name}</option>`).join('');
            return `
                <div class="action-item">
                    <div style="flex: 1; display: flex; gap: 10px; flex-wrap: wrap;">
                        <select onchange="updateAction(${index}, 'deviceId', this.value)" style="flex: 1;">${deviceOptions}</select>
                        <select onchange="updateAction(${index}, 'command', this.value)" style="width: 120px;">
                            <option value="turn_on" ${action.command === 'turn_on' ? 'selected' : ''}>Aan</option>
                            <option value="turn_off" ${action.command === 'turn_off' ? 'selected' : ''}>Uit</option>
                            <option value="toggle" ${action.command === 'toggle' ? 'selected' : ''}>Schakelen</option>
                            <option value="set_brightness" ${action.command === 'set_brightness' ? 'selected' : ''}>Helderheid</option>
                            <option value="set_color" ${action.command === 'set_color' ? 'selected' : ''}>Kleur</option>
                            <option value="play" ${action.command === 'play' ? 'selected' : ''}>Afspelen</option>
                            <option value="pause" ${action.command === 'pause' ? 'selected' : ''}>Pauzeren</option>
                        </select>
                        <input type="text" placeholder="Waarde (opt)" value="${action.value || ''}" onchange="updateAction(${index}, 'value', this.value)" style="width: 80px;">
                    </div>
                    <button type="button" onclick="removeAction(${index})" style="color: var(--danger); background: none; border: none; cursor: pointer; margin-left: 10px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        } else if (action.type === 'delay') {
            return `
                <div class="action-item">
                    <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                        <strong>Wacht</strong>
                        <input type="number" value="${action.duration}" onchange="updateAction(${index}, 'duration', parseInt(this.value))" style="width: 100px;"> ms
                    </div>
                    <button type="button" onclick="removeAction(${index})" style="color: var(--danger); background: none; border: none; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }
        return '';
    }).join('') + '<div id="emptyActionsMsg" style="text-align: center; color: var(--text-muted); padding: 20px; display: none;">Nog geen acties toegevoegd. Klik op + om te beginnen.</div>';
    
    // Update empty message visibility
    const emptyMsg = document.getElementById('emptyActionsMsg');
    if(emptyMsg) emptyMsg.style.display = currentActions.length === 0 ? 'block' : 'none';
}

// --- Save Logic ---

window.saveAutomation = async () => {
    const id = document.getElementById('automationId').value;
    const name = document.getElementById('autoName').value;
    const triggerType = document.getElementById('triggerType').value;
    
    let trigger = { type: triggerType };
    
    if (triggerType === 'presence') {
        trigger.event = document.getElementById('presenceEvent').value;
    } else if (triggerType === 'time') {
        let cronVal = document.getElementById('timeCron').value.trim();
        // Support simple HH:MM format
        const timeMatch = cronVal.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const [_, h, m] = timeMatch;
            cronVal = `0 ${parseInt(m)} ${parseInt(h)} * * *`;
        }
        trigger.cron = cronVal;
    } else if (triggerType === 'state') {
        trigger.deviceId = document.getElementById('stateDevice').value;
        trigger.property = document.getElementById('stateProperty').value;
        trigger.value = document.getElementById('stateValue').value;
        // Try to parse boolean/number
        if (trigger.value === 'true') trigger.value = true;
        else if (trigger.value === 'false') trigger.value = false;
        else if (!isNaN(trigger.value)) trigger.value = Number(trigger.value);
    } else if (triggerType === 'weather') {
        trigger.condition = document.getElementById('weatherCondition').value;
        trigger.location = document.getElementById('weatherLocation').value;
        trigger.lat = document.getElementById('weatherLat').value;
        trigger.lon = document.getElementById('weatherLon').value;
        if (trigger.condition === 'temp_above' || trigger.condition === 'temp_below') {
            trigger.value = document.getElementById('weatherValue').value;
        }
    }

    // Ensure actions have 'type' set correctly if added via new interface
    const sanitizedActions = currentActions.map(a => ({
        ...a,
        type: a.type || (a.duration ? 'delay' : 'device') 
    }));

    const payload = {
        id: id || undefined,
        name,
        enabled: true,
        trigger,
        actions: sanitizedActions
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/automations/${id}` : '/api/automations';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeAutomationModal();
            loadAutomations();
        } else {
            const data = await res.json();
            alert('Fout: ' + data.message);
        }
    } catch (e) {
        alert('Netwerkfout: ' + e.message);
    }
};