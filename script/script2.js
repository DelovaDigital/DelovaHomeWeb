document.addEventListener('DOMContentLoaded', () => {
    const hubNameEl = document.getElementById('hubName');
    const hubIdEl = document.getElementById('hubId');
    const hubVersionEl = document.getElementById('hubVersion');
    const hubUptimeEl = document.getElementById('hubUptime');
    const btnCheckForUpdates = document.getElementById('btnCheckForUpdates');

    // Functie om hub informatie te laden
    async function loadHubInfo() {
        try {
            const res = await fetch('/api/system/info');
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const info = await res.json();

            if (hubNameEl) hubNameEl.textContent = info.name;
            if (hubIdEl) hubIdEl.textContent = info.hubId;
            if (hubVersionEl) hubVersionEl.textContent = info.version;
            if (hubUptimeEl) hubUptimeEl.textContent = Math.floor(info.uptime / 60) + ' min'; // Format uptime

        } catch (error) {
            console.error("Fout bij het ophalen van hub info:", error);
            if (hubNameEl) hubNameEl.textContent = "Error";
            if (hubIdEl) hubIdEl.textContent = "Error";
            if (hubVersionEl) hubVersionEl.textContent = "Error";
            if (hubUptimeEl) hubUptimeEl.textContent = "Error";
        }
    }

    // Update check logica
    if (btnCheckForUpdates) {
        btnCheckForUpdates.addEventListener('click', async () => {
            const btn = btnCheckForUpdates;
            const originalText = btn.textContent;
            btn.textContent = 'Controleren...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/system/check-update');
                const data = await res.json();

                if (data.canUpdate) {
                    if (confirm('Er is een nieuwe versie beschikbaar. Wil je nu updaten?')) {
                        btn.textContent = 'Updaten...';
                        const updateRes = await fetch('/api/system/update', { method: 'POST' });
                        const updateData = await updateRes.json();
                        
                        if (updateData.success) {
                            alert('Update geslaagd! De server wordt herstart. De pagina wordt zo herladen.');
                            setTimeout(() => window.location.reload(), 5000);
                        } else {
                            alert('Update mislukt: ' + (updateData.details || 'Onbekende fout'));
                            btn.textContent = originalText;
                            btn.disabled = false;
                        }
                    } else {
                        btn.textContent = originalText;
                        btn.disabled = false;
                    }
                } else {
                    alert('Je bent up-to-date!');
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            } catch (e) {
                console.error(e);
                alert('Fout bij controleren op updates.');
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // Apple TV Pairing Logic
    const btnStartPairing = document.getElementById('btn-start-pairing');
    const btnSubmitPin = document.getElementById('btn-submit-pin');
    const atvIpInput = document.getElementById('atv-ip');
    const atvPinInput = document.getElementById('atv-pin');
    const step1 = document.getElementById('atv-pairing-step-1');
    const step2 = document.getElementById('atv-pairing-step-2');
    const statusDiv = document.getElementById('atv-pairing-status');

    if (btnStartPairing) {
        btnStartPairing.addEventListener('click', async () => {
            const ip = atvIpInput.value.trim();
            if (!ip) {
                statusDiv.textContent = 'Vul een IP adres in.';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Bezig met verbinden...';
            statusDiv.style.color = 'orange';
            btnStartPairing.disabled = true;

            try {
                const res = await fetch('/api/pair/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip })
                });
                const data = await res.json();

                if (data.ok && data.status === 'waiting_for_pin') {
                    statusDiv.textContent = 'Verbinding gemaakt. Voer PIN in.';
                    statusDiv.style.color = 'blue';
                    step1.style.display = 'none';
                    step2.style.display = 'block';
                } else {
                    statusDiv.textContent = 'Fout: ' + (data.message || 'Onbekende fout');
                    statusDiv.style.color = 'red';
                    btnStartPairing.disabled = false;
                }
            } catch (err) {
                statusDiv.textContent = 'Netwerkfout: ' + err.message;
                statusDiv.style.color = 'red';
                btnStartPairing.disabled = false;
            }
        });
    }

    if (btnSubmitPin) {
        btnSubmitPin.addEventListener('click', async () => {
            const pin = atvPinInput.value.trim();
            if (!pin) {
                statusDiv.textContent = 'Vul een PIN in.';
                return;
            }

            statusDiv.textContent = 'PIN verifiëren...';
            statusDiv.style.color = 'orange';
            btnSubmitPin.disabled = true;

            try {
                const res = await fetch('/api/pair/pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin })
                });
                const data = await res.json();

                if (data.ok) {
                    statusDiv.textContent = 'Koppelen geslaagd!';
                    statusDiv.style.color = 'green';
                    setTimeout(() => {
                        step2.style.display = 'none';
                        step1.style.display = 'block';
                        atvIpInput.value = '';
                        atvPinInput.value = '';
                        btnStartPairing.disabled = false;
                        btnSubmitPin.disabled = false;
                        statusDiv.textContent = '';
                    }, 3000);
                } else {
                    statusDiv.textContent = 'Fout: ' + (data.message || 'Verkeerde PIN');
                    statusDiv.style.color = 'red';
                    btnSubmitPin.disabled = false;
                }
            } catch (err) {
                statusDiv.textContent = 'Netwerkfout: ' + err.message;
                statusDiv.style.color = 'red';
                btnSubmitPin.disabled = false;
            }
        });
    }

    // NAS Pairing Logic
    const btnAddNas = document.getElementById('btn-add-nas');
    const nasHost = document.getElementById('nas-host');
    const nasShare = document.getElementById('nas-share');
    const nasDomain = document.getElementById('nas-domain');
    const nasUser = document.getElementById('nas-user');
    const nasPass = document.getElementById('nas-pass');
    const nasStatus = document.getElementById('nas-status');

    if (btnAddNas) {
        btnAddNas.addEventListener('click', async () => {
            const host = nasHost.value.trim();
            const share = nasShare.value.trim();
            const domain = nasDomain ? nasDomain.value.trim() : '';
            const username = nasUser.value.trim();
            const password = nasPass.value.trim();

            if (!host || !share) {
                nasStatus.textContent = 'Host en Share zijn verplicht.';
                nasStatus.style.color = 'red';
                return;
            }

            nasStatus.textContent = 'Verbinden...';
            nasStatus.style.color = 'orange';
            btnAddNas.disabled = true;

            try {
                const res = await fetch('/api/nas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ host, share, domain, username, password })
                });
                const data = await res.json();

                if (data.ok) {
                    nasStatus.textContent = 'Verbonden!';
                    nasStatus.style.color = 'green';
                    // Clear inputs
                    nasHost.value = '';
                    nasShare.value = '';
                    if (nasDomain) nasDomain.value = '';
                    nasUser.value = '';
                    nasPass.value = '';
                    
                    setTimeout(() => {
                         nasStatus.innerHTML = 'Verbonden! <a href="files.html">Ga naar bestanden</a>';
                         btnAddNas.disabled = false;
                    }, 1000);
                } else {
                    nasStatus.textContent = 'Fout: ' + (data.message || 'Kon niet verbinden');
                    nasStatus.style.color = 'red';
                    btnAddNas.disabled = false;
                }
            } catch (err) {
                nasStatus.textContent = 'Netwerkfout: ' + err.message;
                nasStatus.style.color = 'red';
                btnAddNas.disabled = false;
            }
        });
    }

    // Initial load
    loadHubInfo();
});