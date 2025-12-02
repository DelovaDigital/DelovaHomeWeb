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