document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;

    if (!username || !password) {
      msg.textContent = 'Vul gebruikersnaam en wachtwoord in';
      return;
    }
    if (password !== confirm) {
      msg.textContent = 'Wachtwoorden komen niet overeen';
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
        msg.textContent = 'Gebruiker aangemaakt';
        form.reset();
      } else {
        msg.textContent = data.message || 'Fout bij aanmaken gebruiker';
      }
    } catch (err) {
      console.error('Registration failed', err);
      msg.textContent = 'Kon geen verbinding maken met de server';
    }
  });
});
