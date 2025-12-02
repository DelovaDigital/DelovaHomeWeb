const opslaan = document.querySelector('.btn-primary');
const updateToggle = document.querySelector('.switch input[type="checkbox"]');
const updates = document.querySelector('.btnCheck');

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