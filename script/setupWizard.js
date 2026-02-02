document.addEventListener('DOMContentLoaded', () => {
    const setupRequired = localStorage.getItem('setupRequired');
    
    if (setupRequired !== 'false') {
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
                    <button class="btn-primary" onclick="nextStep(25)" data-i18n="next">Next</button>
                </div>
            </div>

            <!-- Step 2.5: Timezone -->
            <div class="setup-step" id="step25">
                <div class="setup-icon"><i class="fas fa-globe"></i></div>
                <h2 class="setup-title" data-i18n="choose_timezone">Choose your Timezone</h2>
                <p class="setup-desc" data-i18n="choose_timezone_desc">Select the timezone for your home.</p>
                
                <div style="max-width:300px; margin:0 auto 30px auto;">
                     <select id="setup-timezone" style="width:100%; padding:15px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:var(--text); font-size:1.1rem; cursor:pointer;">
                        <option value="Europe/Brussels">Brussels (CET/CEST)</option>
                        <option value="Europe/London">London (GMT/BST)</option>
                        <option value="America/New_York">New York (EST/EDT)</option>
                        <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="UTC">UTC</option>
                    </select>
                </div>
                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(2)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="saveTimezoneAndNext()" data-i18n="next">Next</button>
                </div>
            </div>

            <!-- Step 3: Theme -->
            <div class="setup-step" id="step3">
                <div class="setup-icon"><i class="fas fa-palette"></i></div>
                <h2 class="setup-title" data-i18n="choose_theme">Choose your Theme</h2>
                <p class="setup-desc" data-i18n="choose_theme_desc">Select the look and feel you prefer.</p>
                
                <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 30px;">
                    <div class="theme-option" onclick="setTheme('light')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text);">
                        <span style="font-size: 2rem; display: block; margin-bottom: 10px;">☀️</span>
                        <div>Light</div>
                    </div>
                    <div class="theme-option" onclick="setTheme('dark')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--text);">
                        <span style="font-size: 2rem; display: block; margin-bottom: 10px;">🌙</span>
                        <div>Dark</div>
                    </div>
                </div>

                 <div class="setup-actions">
                     <button class="btn-secondary" onclick="nextStep(25)" data-i18n="back">Back</button>
                     <button class="btn-primary" onclick="nextStep(4)" data-i18n="next">Next</button>
                 </div>
            </div>

            <!-- Step 4: Auto Discovery -->
            <div class="setup-step" id="step4">
                <div class="setup-icon"><i class="fas fa-satellite-dish"></i></div>
                <h2 class="setup-title" data-i18n="auto_discovery">Auto Device Discovery</h2>
                <p class="setup-desc" data-i18n="auto_discovery_desc">We'll scan your network and add compatible devices automatically.</p>

                <div style="max-width: 420px; margin: 0 auto 20px auto; text-align: center;">
                    <div id="setup-scan-status" style="margin-bottom: 14px; color: var(--text-muted);" data-i18n="auto_discovery_idle">Ready to scan.</div>
                    <button id="setup-scan-btn" class="btn-primary" onclick="startAutoDiscovery()" data-i18n="start_scan">Start Scan</button>
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(3)" data-i18n="back">Back</button>
                    <button class="btn-secondary" onclick="nextStep(5)" data-i18n="skip_for_now">Skip for now</button>
                    <button class="btn-primary" onclick="nextStep(5)" data-i18n="next">Next</button>
                </div>
            </div>
 
            <!-- Step 5: Finish -->
            <div class="setup-step" id="step5">
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
        const step = document.getElementById(`step${stepNum}`);
        if(step) step.classList.add('active');
    };
    
    window.saveTimezoneAndNext = async () => {
        const tz = document.getElementById('setup-timezone').value;
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ timezone: tz })
            });
        } catch(e) {}
        window.nextStep(3);
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
        localStorage.setItem('setupRequired', 'false');
        localStorage.setItem('setupCompletedAt', new Date().toISOString());
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            window.location.reload(); 
        }, 500);
    };

    window.startAutoDiscovery = async () => {
        const statusEl = document.getElementById('setup-scan-status');
        const scanBtn = document.getElementById('setup-scan-btn');
        if (!statusEl || !scanBtn) return;

        scanBtn.disabled = true;
        statusEl.textContent = window.t ? window.t('auto_discovery_scanning') : 'Scanning...';
        try {
            const res = await fetch('/api/devices/scan', { method: 'POST' });
            const data = await res.json();
            if (data && data.ok) {
                statusEl.textContent = window.t ? window.t('auto_discovery_success') : 'Scan complete. Devices will appear shortly.';
            } else {
                statusEl.textContent = window.t ? window.t('auto_discovery_failed') : 'Scan failed. You can try again.';
            }
        } catch (e) {
            statusEl.textContent = window.t ? window.t('auto_discovery_failed') : 'Scan failed. You can try again.';
        } finally {
            scanBtn.disabled = false;
        }
    };
}
