document.addEventListener('DOMContentLoaded', () => {
    const avatar = document.querySelector('.user-avatar');
    const dropdown = document.getElementById('userDropdown');
    const btnLogin = document.getElementById('btnLogin');
    const themeStylesheet = document.getElementById('theme-stylesheet');

    if (themeStylesheet) {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            themeStylesheet.href = '../style/style-dark.css';
        }
    }

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

    if (btnLogin) btnLogin.addEventListener('click', login);
    async function login(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!username || !password) {
            alert('Vul gebruikersnaam en wachtwoord in');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                // Login succeeded
                window.location.href = '../pages/dashboard.html';
            } else {
                alert(data.message || 'Inloggen mislukt');
            }
        } catch (err) {
            console.error('Login request failed', err);
            alert('Kon geen verbinding maken met de server');
        }
    }
});