let automations = [];
let devices = [];
let currentActions = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Load navigation
    const nav = document.querySelector('.main-nav');
    if (nav) {
        // Simple nav injection if not handled by script.js
        // But script.js usually handles it.
    }
    
    await loadDevices();
    await loadAutomations();
});

async function loadDevices() {
    try {
        const res = await fetch('/api/devices');
        devices = await res.json();
        
        // Populate device dropdowns
        const stateDevice = document.getElementById('stateDevice');
        if (stateDevice) {
            stateDevice.innerHTML = devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        }
    } catch (e) {
        console.error('Error loading devices:', e);
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
        return `Tijd: ${t.cron}`;
    } else if (t.type === 'state') {
        const d = devices.find(dev => dev.id === t.deviceId);
        return `Als ${d ? d.name : t.deviceId} ${t.property} == ${t.value}`;
    }
    return 'Onbekend';
}

// --- Modal Logic ---

window.openAutomationModal = () => {
    document.getElementById('automationModal').style.display = 'block';
    document.getElementById('modalTitle').textContent = 'Nieuwe Automatisering';
    document.getElementById('automationId').value = '';
    document.getElementById('autoName').value = '';
    document.getElementById('triggerType').value = 'presence';
    updateTriggerFields();
    currentActions = [];
    renderActions();
};

window.closeAutomationModal = () => {
    document.getElementById('automationModal').style.display = 'none';
};

window.updateTriggerFields = () => {
    const type = document.getElementById('triggerType').value;
    document.querySelectorAll('.trigger-group').forEach(el => el.style.display = 'none');
    document.getElementById(`trigger-${type}`).style.display = 'block';
};

window.editAutomation = (id) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;

    openAutomationModal();
    document.getElementById('modalTitle').textContent = 'Automatisering Bewerken';
    document.getElementById('automationId').value = auto.id;
    document.getElementById('autoName').value = auto.name;
    document.getElementById('triggerType').value = auto.trigger.type;
    updateTriggerFields();

    if (auto.trigger.type === 'presence') {
        document.getElementById('presenceEvent').value = auto.trigger.event;
    } else if (auto.trigger.type === 'time') {
        document.getElementById('timeCron').value = auto.trigger.cron;
    } else if (auto.trigger.type === 'state') {
        document.getElementById('stateDevice').value = auto.trigger.deviceId;
        document.getElementById('stateProperty').value = auto.trigger.property;
        document.getElementById('stateValue').value = auto.trigger.value;
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

window.addAction = () => {
    // Simple prompt for now, could be a sub-modal
    const type = prompt('Actie Type (device, delay):', 'device');
    if (!type) return;

    if (type === 'device') {
        // Add a placeholder, user needs to edit it in the UI? 
        // For simplicity, let's just add a default one and let them edit it in the list if we make it editable.
        // Or better, just add a default one.
        currentActions.push({
            type: 'device',
            deviceId: devices[0]?.id || '',
            command: 'turn_off',
            value: null
        });
    } else if (type === 'delay') {
        currentActions.push({
            type: 'delay',
            duration: 1000
        });
    }
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
    }).join('');
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
        trigger.cron = document.getElementById('timeCron').value;
    } else if (triggerType === 'state') {
        trigger.deviceId = document.getElementById('stateDevice').value;
        trigger.property = document.getElementById('stateProperty').value;
        trigger.value = document.getElementById('stateValue').value;
        // Try to parse boolean/number
        if (trigger.value === 'true') trigger.value = true;
        else if (trigger.value === 'false') trigger.value = false;
        else if (!isNaN(trigger.value)) trigger.value = Number(trigger.value);
    }

    const payload = {
        id: id || undefined,
        name,
        enabled: true,
        trigger,
        actions: currentActions
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
