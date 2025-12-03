const opslaan = document.querySelector('.btn-primary');
const updateToggle = document.querySelector('.switch input[type="checkbox"]');
const updates = document.querySelector('.btnCheck');
const darkModeToggle = document.getElementById('darkModeToggle');
const themeStylesheet = document.getElementById('theme-stylesheet');

// Load saved theme preference on page load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    themeStylesheet.href = '../style/style-dark.css';
    if (darkModeToggle) darkModeToggle.checked = true;
  }
});

// Dark mode toggle functionality
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