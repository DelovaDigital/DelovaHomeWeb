document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('msg');
  const createUserBtn = document.getElementById('createUser');
  const goToLoginBtn = document.getElementById('goToLogin');

  goToLoginBtn.addEventListener('click', () => {
    window.location.href = '../index.html';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    msg.style.display = 'none';
    msg.textContent = '';
    msg.className = ''; // Reset classes

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;

    if (!username || !password) {
      showError('Vul gebruikersnaam en wachtwoord in');
      return;
    }

    if (password !== confirm) {
      showError('Wachtwoorden komen niet overeen');
      return;
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        showSuccess('Gebruiker aangemaakt!');
        
        // Flag for first-time setup wizard
        localStorage.setItem('setupRequired', 'true');
        
        form.reset();
        setTimeout(() => {
          window.location.href = '../index.html';
        }, 2000);

      } else {
        showError(data.message || 'Fout bij aanmaken gebruiker');
        form.reset();
      }
    } catch (err) {
      console.error('Registration failed', err);
      showError('Kon geen verbinding maken met de server');
    }
  });

  function showError(text) {
      msg.textContent = text;
      msg.style.background = 'rgba(239, 68, 68, 0.1)';
      msg.style.color = '#ef4444';
      msg.style.border = '1px solid #ef4444';
      msg.style.display = 'block';
  }

  function showSuccess(text) {
      msg.textContent = text;
      msg.style.background = 'rgba(16, 185, 129, 0.1)';
      msg.style.color = '#10b981';
      msg.style.border = '1px solid #10b981';
      msg.style.display = 'block';
  }

  function validateInputs() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    
    if (username && password.length >= 6 && password === confirm) {
      createUserBtn.disabled = false;
      createUserBtn.style.opacity = '1';
      createUserBtn.style.cursor = 'pointer';
      msg.style.display = 'none';
      return;
    }
    
    if (password.length > 0 && password.length < 6) {
       // Optional: show real-time validation
    }
    
    createUserBtn.disabled = true;
    createUserBtn.style.opacity = '0.5';
    createUserBtn.style.cursor = 'not-allowed';
  }

  document.getElementById('username').addEventListener('input', validateInputs);
  document.getElementById('password').addEventListener('input', validateInputs);
  document.getElementById('confirm').addEventListener('input', validateInputs);

  validateInputs();
});
