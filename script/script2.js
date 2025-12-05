const opslaan = document.querySelector('.btn-primary');
const updateToggle = document.querySelector('.switch input[type="checkbox"]');
const updates = document.querySelector('.btnCheck');
const darkModeToggle = document.getElementById('darkModeToggle');
const themeStylesheet = document.getElementById('theme-stylesheet');

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    themeStylesheet.href = '../style/style-dark.css';
    if (darkModeToggle) darkModeToggle.checked = true;
  }

  const username = localStorage.getItem('username');
  const usernameDisplay = document.getElementById('usernameDisplay');
  if (usernameDisplay && username) {
    usernameDisplay.textContent = `Hallo, ${username}`;
  }

  const logoutLink = document.querySelector('.logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('username');
      localStorage.removeItem('userId');
      window.location.href = '../index.html';
    });
  }
});

if (darkModeToggle) {
  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      themeStylesheet.href = '../style/style-dark.css';
      localStorage.setItem('theme', 'dark');
      console.log('Dark mode ingeschakeld');
    } else {
      themeStylesheet.href = '../style/style.css';
      localStorage.setItem('theme', 'light');
      console.log('Light mode ingeschakeld');
    }
  });
}


updates.addEventListener('click', () => {
    alert('Je bent up-to-date!');
});

updateToggle.addEventListener('change', () => {
    if (updateToggle.checked) {
        console.log('Automatische updates ingeschakeld');
    } else {
        console.log('Automatische updates uitgeschakeld');
    }
});



opslaan.addEventListener('click', () => {
    if (document.getElementById('username').value == null) {
        alert('Voer een geldige gebruikersnaam in.');   
    }
    alert('Instellingen opgeslagen!');
    });


document.addEventListener('DOMContentLoaded', () => {
  const avatar = document.querySelector('.user-avatar');
  const dropdown = document.getElementById('userDropdown');

  const closeDropdown = () => {
    if (dropdown) dropdown.classList.remove('show');
  };

  const toggleDropdown = (e) => {
    if (!dropdown) return;
    e.stopPropagation();
    dropdown.classList.toggle('show');
  };

  if (avatar) avatar.addEventListener('click', toggleDropdown);
  if (dropdown) dropdown.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', closeDropdown);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });
});

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