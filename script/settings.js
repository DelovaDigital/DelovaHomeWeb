document.addEventListener('DOMContentLoaded', () => {
    // --- Tab Switching Logic ---
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked item
            item.classList.add('active');

            // Hide all sections
            sections.forEach(section => section.classList.remove('active'));
            
            // Show target section
            const targetId = item.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    // --- Energy Settings ---
    const energyForm = document.getElementById('energy-form');
    const solarCapacityInput = document.getElementById('solar-capacity');
    const gridLimitInput = document.getElementById('grid-limit');
    const costKwhInput = document.getElementById('cost-kwh');
    const btnSaveEnergy = document.getElementById('btn-save-energy');

    // Load Energy Config
    fetch('/api/energy/config')
        .then(res => res.json())
        .then(config => {
            if (config) {
                solarCapacityInput.value = config.solarCapacity || '';
                gridLimitInput.value = config.gridLimit || '';
                costKwhInput.value = config.costPerKwh || '';
            }
        })
        .catch(err => console.error('Failed to load energy config:', err));

    // Save Energy Config
    if (btnSaveEnergy) {
        btnSaveEnergy.addEventListener('click', async () => {
            const originalText = btnSaveEnergy.textContent;
            btnSaveEnergy.textContent = 'Opslaan...';
            btnSaveEnergy.disabled = true;

            const config = {
                solarCapacity: parseFloat(solarCapacityInput.value),
                gridLimit: parseFloat(gridLimitInput.value),
                costPerKwh: parseFloat(costKwhInput.value)
            };

            try {
                const res = await fetch('/api/energy/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                if (res.ok) {
                    btnSaveEnergy.textContent = 'Opgeslagen!';
                    setTimeout(() => {
                        btnSaveEnergy.textContent = originalText;
                        btnSaveEnergy.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (err) {
                console.error(err);
                btnSaveEnergy.textContent = 'Fout!';
                setTimeout(() => {
                    btnSaveEnergy.textContent = originalText;
                    btnSaveEnergy.disabled = false;
                }, 2000);
            }
        });
    }

    // --- KNX Settings ---
    const knxForm = document.getElementById('knx-form');
    const knxIpInput = document.getElementById('knx-ip');
    const knxPortInput = document.getElementById('knx-port');
    const knxPhysInput = document.getElementById('knx-phys');
    const btnSaveKnx = document.getElementById('btn-save-knx');

    // Load KNX Config
    fetch('/api/knx/config')
        .then(res => res.json())
        .then(config => {
            if (config) {
                knxIpInput.value = config.ipAddr || '';
                knxPortInput.value = config.ipPort || 3671;
                knxPhysInput.value = config.physAddr || '1.1.128';
            }
        })
        .catch(err => console.error('Failed to load KNX config:', err));

    // Save KNX Config
    if (btnSaveKnx) {
        btnSaveKnx.addEventListener('click', async () => {
            const originalText = btnSaveKnx.textContent;
            btnSaveKnx.textContent = 'Verbinden...';
            btnSaveKnx.disabled = true;

            const config = {
                ipAddr: knxIpInput.value,
                ipPort: parseInt(knxPortInput.value),
                physAddr: knxPhysInput.value
            };

            try {
                const res = await fetch('/api/knx/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                if (res.ok) {
                    btnSaveKnx.textContent = 'Verbonden!';
                    setTimeout(() => {
                        btnSaveKnx.textContent = originalText;
                        btnSaveKnx.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (err) {
                console.error(err);
                btnSaveKnx.textContent = 'Fout!';
                setTimeout(() => {
                    btnSaveKnx.textContent = originalText;
                    btnSaveKnx.disabled = false;
                }, 2000);
            }
        });
    }
});
