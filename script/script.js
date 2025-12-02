function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('show');
}

window.addEventListener('click', function(event) {
    const container = document.querySelector('.user-menu-container');
    if (!container) return;
    if (!container.contains(event.target)) {
        const dropdowns = document.getElementsByClassName('user-dropdown');
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('show');
        }
    }
});
