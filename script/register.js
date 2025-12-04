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

    msg.style.visibility = 'hidden';
    msg.textContent = '';
    msg.style.backgroundColor = '';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;

    if (!username || !password) {
      msg.textContent = 'Vul gebruikersnaam en wachtwoord in';
      msg.style.backgroundColor = 'red';
      msg.style.visibility = 'visible';
      return;
    }

    if (password !== confirm) {
      msg.textContent = 'Wachtwoorden komen niet overeen';
      msg.style.backgroundColor = 'red';
      msg.style.visibility = 'visible';
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
        msg.style.backgroundColor = 'green';
        msg.textContent = 'Gebruiker aangemaakt!';
        msg.style.visibility = 'visible';

        form.reset();
        validateInputs();

        setTimeout(() => {
          window.location.href = '../index.html';
        }, 2000);

      } else {
        msg.style.backgroundColor = 'red';
        msg.textContent = data.message || 'Fout bij aanmaken gebruiker';
        msg.style.visibility = 'visible';
        form.reset();
      }
    } catch (err) {
      console.error('Registration failed', err);
      msg.style.backgroundColor = 'red';
      msg.textContent = 'Kon geen verbinding maken met de server';
      msg.style.visibility = 'visible';
    }
  });

  function validateInputs() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    if (username && password.length >= 6 && password === confirm) {
      createUserBtn.disabled = false;
      createUserBtn.style.backgroundColor = '#4CAF50';
      createUserBtn.style.color = 'white';
      msg.style.visibility = 'hidden';
      return;
    }
    if (password.length > 0 && password.length < 6) {
      msg.textContent = 'Wachtwoord moet minstens 6 tekens zijn';
      msg.style.backgroundColor = 'red';
      msg.style.visibility = 'visible';
    }
    else if (confirm.length > 0 && password !== confirm) {
      msg.textContent = 'Wachtwoorden komen niet overeen';
      msg.style.backgroundColor = 'red';
      msg.style.visibility = 'visible';
    }
    else {
      msg.style.visibility = 'hidden';
    }

    createUserBtn.disabled = true;
    createUserBtn.style.backgroundColor = 'white';
    createUserBtn.style.color = 'gray';
  }

  document.getElementById('username').addEventListener('input', validateInputs);
  document.getElementById('password').addEventListener('input', validateInputs);
  document.getElementById('confirm').addEventListener('input', validateInputs);

  validateInputs();
});
