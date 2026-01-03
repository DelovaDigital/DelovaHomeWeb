// animations.js — small helpers for staggered widget entrance and accessibility-aware behavior

document.addEventListener('DOMContentLoaded', () => {
  try {
    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Staggered fade-in for widgets
    const widgets = Array.from(document.querySelectorAll('.widget, #spotify-widget-container'));
    if (!prefersReduce) {
      widgets.forEach((w, i) => {
        // start hidden
        w.style.opacity = '0';
        w.style.transform = 'translateY(8px)';
        // staggered reveal
        setTimeout(() => {
          w.style.opacity = '1';
          w.style.transform = 'translateY(0)';
        }, 90 * i);
      });
    } else {
      widgets.forEach(w => {
        w.style.opacity = '1';
        w.style.transform = 'none';
      });
    }

    // Ripple Effect for Buttons
    document.addEventListener('click', function(e) {
      const target = e.target.closest('button, .btn-primary');
      if (target) {
        const rect = target.getBoundingClientRect();
        const circle = document.createElement('span');
        const diameter = Math.max(rect.width, rect.height);
        const radius = diameter / 2;

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${e.clientX - rect.left - radius}px`;
        circle.style.top = `${e.clientY - rect.top - radius}px`;
        circle.classList.add('ripple');

        const ripple = target.getElementsByClassName('ripple')[0];
        if (ripple) {
          ripple.remove();
        }

        target.appendChild(circle);
      }
    });

    // Apply Fade In Up to main content
    const mainContent = document.querySelector('.content-area');
    if (mainContent) {
        mainContent.classList.add('fade-in-up');
    }

    // Ensure user dropdown respects the CSS show transition (script toggles .show)
    // If existing code toggles inline display, normalize it: convert display toggles to class toggles
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
      // If dropdown uses inline style display:none/'' somewhere else, remove it to allow CSS transitions
      dropdown.style.display = '';
    }

    // Small helper to add/remove spotify playing class if an element with id 'spotifyPlaying' exists
    // The site's spotify widget scripts are responsible for updating playback state; this adds a convenience hook
    const observer = new MutationObserver(() => {
      const art = document.querySelector('.spotify-artwork');
      const playingFlag = document.querySelector('.spotify-playing');
      if (art) {
        if (playingFlag) art.classList.add('playing');
        else art.classList.remove('playing');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

  } catch (e) {
    console.error('animations.js error', e);
  }
});
