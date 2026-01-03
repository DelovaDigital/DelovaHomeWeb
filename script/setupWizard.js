document.addEventListener('DOMContentLoaded', () => {
    const setupRequired = localStorage.getItem('setupRequired');
    
    if (setupRequired === 'true') {
        startSetupWizard();
    }
});

function startSetupWizard() {
    // Create Wizard HTML
    const overlay = document.createElement('div');
    overlay.className = 'setup-wizard-overlay';
    
    overlay.innerHTML = `
        <div class="setup-wizard-container glass-card">
            <!-- Step 1: Welcome -->
            <div class="setup-step active" id="step1">
                <div class="setup-icon"><i class="fas fa-home"></i></div>
                <h2 class="setup-title" data-i18n="welcome">Welcome to DelovaHome</h2>
                <p class="setup-desc" data-i18n="welcome_desc">Your smart home journey starts here. Let's get you set up in just a few seconds.</p>
                <div class="setup-actions">
                    <button class="btn-primary" onclick="nextStep(2)" data-i18n="get_started">Get Started</button>
                </div>
            </div>

            <!-- Step 2: Language -->
            <div class="setup-step" id="step2">
                <div class="setup-icon"><i class="fas fa-language"></i></div>
                <h2 class="setup-title" data-i18n="choose_language">Choose your Language</h2>
                <p class="setup-desc" data-i18n="choose_language_desc">Select the language you want to use.</p>
                
                <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 30px;">
                    <div class="theme-option" onclick="setLanguage('nl')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text);">
                        <span style="font-size: 2rem; display: block; margin-bottom: 10px;">🇳🇱</span>
                        <div>Nederlands</div>
                    </div>
                    <div class="theme-option" onclick="setLanguage('en')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text);">
                        <span style="font-size: 2rem; display: block; margin-bottom: 10px;">🇬🇧</span>
                        <div>English</div>
                    </div>
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(1)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="nextStep(3)" data-i18n="next">Next</button>
                </div>
            </div>

            <!-- Step 3: Theme -->
            <div class="setup-step" id="step3">
                <div class="setup-icon"><i class="fas fa-palette"></i></div>
                <h2 class="setup-title" data-i18n="choose_theme">Choose your Theme</h2>
                <p class="setup-desc" data-i18n="choose_theme_desc">Select the look that fits your style.</p>
                
                <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 30px;">
                    <div class="theme-option" onclick="setTheme('light')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: #f8fafc; color: #333;">
                        <i class="fas fa-sun" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <div data-i18n="light">Light</div>
                    </div>
                    <div class="theme-option" onclick="setTheme('dark')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: #1e293b; color: white;">
                        <i class="fas fa-moon" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <div data-i18n="dark">Dark</div>
                    </div>
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(2)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="nextStep(4)" data-i18n="next">Next</button>
                </div>
            </div>

            <!-- Step 4: Finish -->
            <div class="setup-step" id="step4">
                <div class="setup-icon"><i class="fas fa-check-circle"></i></div>
                <h2 class="setup-title" data-i18n="all_set">You're All Set!</h2>
                <p class="setup-desc" data-i18n="all_set_desc">DelovaHome is ready to manage your devices. Explore the dashboard to get started.</p>
                <div class="setup-actions">
                    <button class="btn-primary" onclick="finishSetup()" data-i18n="go_dashboard">Go to Dashboard</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Initialize translations for the wizard
    if (window.applyTranslations) window.applyTranslations();

    // Expose functions to global scope for onclick handlers
    window.nextStep = (stepNum) => {
        document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
        document.getElementById(`step${stepNum}`).classList.add('active');
    };
    
    window.setLanguage = (lang) => {
        localStorage.setItem('language', lang);
        if (window.applyTranslations) window.applyTranslations();
        
        // Visual feedback
        const options = document.querySelectorAll('#step2 .theme-option');
        options.forEach(el => el.style.borderColor = 'transparent');
        const selected = lang === 'nl' ? 0 : 1;
        options[selected].style.borderColor = 'var(--primary)';
    };

    window.setTheme = (theme) => {
        const themeStylesheet = document.getElementById('theme-stylesheet');
        if (theme === 'dark') {
            themeStylesheet.href = '../style/style-dark.css';
            localStorage.setItem('theme', 'dark');
        } else {
            themeStylesheet.href = '../style/style.css';
            localStorage.setItem('theme', 'light');
        }
        
        // Visual feedback
        const options = document.querySelectorAll('#step3 .theme-option');
        options.forEach(el => el.style.borderColor = 'transparent');
        const selected = theme === 'light' ? 0 : 1; 
        options[selected].style.borderColor = 'var(--primary)';
    };
    
    window.finishSetup = () => {
        localStorage.removeItem('setupRequired');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            window.location.reload(); 
        }, 500);
    };
}
