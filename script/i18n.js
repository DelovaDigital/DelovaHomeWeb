(function() {
    window.translations = {}; // Will be populated from JSON

    async function loadTranslations() {
        try {
            const res = await fetch('../data/locales.json');
            if (res.ok) {
                window.translations = await res.json();
                applyTranslations(); // Apply immediately after loading
                console.log('[i18n] Translations loaded');
                window.dispatchEvent(new Event('translationsLoaded'));
            } else {
                console.error("Failed to load locales.json");
            }
        } catch (e) {
            console.error("Error fetching translations:", e);
        }
    }

    window.t = function(key) {
        const lang = localStorage.getItem('language') || 'nl';
        let val = null;

        // Try selected language
        if (window.translations && window.translations[lang]) {
            val = window.translations[lang][key];
        }

        // Try fallback English
        if (!val && window.translations && window.translations['en']) {
             val = window.translations['en'][key];
        }
        // If no translation found, prettify the key: replace underscores with spaces and capitalize
        if (val) return val;
        const prettify = (k) => {
            try {
                // Remove any standalone 'desc' tokens (e.g. welcome_desc) and similar suffixes
                let s = k.replace(/\bdesc\b/gi, '');
                // Also remove trailing separators before cleaned 'desc' (e.g. '_desc', '-desc', '.desc')
                s = s.replace(/[_\-\. ]+$/g, '');
                // Normalize separators to spaces, collapse multiple spaces, trim
                s = s.replace(/[_\-\.]+/g, ' ').replace(/\s+/g, ' ').trim();
                // Capitalize first letter of each word
                return s.replace(/\b\w/g, c => c.toUpperCase());
            } catch (e) {
                return k;
            }
        };
        return prettify(key);
    };

    window.applyTranslations = function() {
        const lang = localStorage.getItem('language') || 'nl';
        document.documentElement.lang = lang;

        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = window.t(key);

                if (text) {
                    // Clean up any lingering 'desc' tokens in prettified/fallback text
                    const cleanText = (t) => {
                        try {
                            return String(t).replace(/\bdesc\b/gi, '').replace(/\s+/g, ' ').trim();
                        } catch (e) {
                            return t;
                        }
                    };

                    const applied = cleanText(text);

                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        if (el.hasAttribute('placeholder')) {
                            el.setAttribute('placeholder', applied);
                        } else if (el.type === 'submit' || el.type === 'button') {
                            el.value = applied;
                        }
                    } else {
                        el.textContent = applied;
                    }
                }
        });
        
        window.dispatchEvent(new Event('translations-applied'));
    };
    
    // Initial Load
    document.addEventListener('DOMContentLoaded', () => {
        loadTranslations();
    });

})();
