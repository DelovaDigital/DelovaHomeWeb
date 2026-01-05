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
                    <button class="btn-secondary" onclick="nextStep(2)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="nextStep(4)" data-i18n="next">Next</button>
                </div>
            </div>

            <!-- Step 4: Cloud Link -->
            <div class="setup-step" id="step4">
                <div class="setup-icon"><i class="fas fa-cloud"></i></div>
                <h2 class="setup-title" data-i18n="link_cloud">Link to Cloud</h2>
                <p class="setup-desc" data-i18n="link_cloud_desc">Access your home from anywhere without port forwarding.</p>
                
                <div style="max-width: 300px; margin: 0 auto 20px auto; text-align: left;">
                    <label style="display:block; margin-bottom:5px;">Cloud URL</label>
                    <input type="text" id="setup-cloud-url" value="https://cloud.delovahome.com" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    
                    <label style="display:block; margin-bottom:5px;">Username</label>
                    <input type="text" id="setup-cloud-user" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    
                    <label style="display:block; margin-bottom:5px;">Password</label>
                    <input type="password" id="setup-cloud-pass" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(3)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="linkCloud()" data-i18n="link_finish">Link & Finish</button>
                    <button class="btn-secondary" onclick="finishSetup()" style="margin-left: 10px;" data-i18n="skip">Skip</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // ... existing functions ...
    


    window.nextStep = (step) => {
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

            <!-- Step 4: Cloud Link -->
            <div class="setup-step" id="step4">
                <div class="setup-icon"><i class="fas fa-cloud"></i></div>
                <h2 class="setup-title" data-i18n="link_cloud">Link to Cloud</h2>
                <p class="setup-desc" data-i18n="link_cloud_desc">Access your home from anywhere without port forwarding.</p>
                
                <div style="max-width: 300px; margin: 0 auto 20px auto; text-align: left;">
                    <label style="display:block; margin-bottom:5px;">Cloud URL</label>
                    <input type="text" id="setup-cloud-url" value="https://cloud.delovahome.com" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <button type="button" id="tab-login" class="btn-secondary active" onclick="toggleCloudTab('login')" style="flex:1;">Login</button>
                        <button type="button" id="tab-register" class="btn-secondary" onclick="toggleCloudTab('register')" style="flex:1;">Register</button>
                    </div>

                    <label style="display:block; margin-bottom:5px;">Username</label>
                    <input type="text" id="setup-cloud-user" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    
                    <div id="email-group" style="display:none;">
                        <label style="display:block; margin-bottom:5px;">Email</label>
                        <input type="email" id="setup-cloud-email" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    </div>

                    <label style="display:block; margin-bottom:5px;">Password</label>
                    <input type="password" id="setup-cloud-pass" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(3)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="linkCloud()" data-i18n="link_finish">Link & Finish</button>
                    <button class="btn-secondary" onclick="finishSetup()" style="margin-left: 10px;" data-i18n="skip">Skip</button>
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

    window.toggleCloudTab = (tab) => {
        const loginBtn = document.getElementById('tab-login');
        const regBtn = document.getElementById('tab-register');
        const emailGroup = document.getElementById('email-group');
        
        if (tab === 'login') {
            loginBtn.classList.add('active');
            loginBtn.style.background = 'var(--primary)';
            loginBtn.style.color = 'white';
            regBtn.classList.remove('active');
            regBtn.style.background = '';
            regBtn.style.color = '';
            emailGroup.style.display = 'none';
        } else {
            regBtn.classList.add('active');
            regBtn.style.background = 'var(--primary)';
            regBtn.style.color = 'white';
            loginBtn.classList.remove('active');
            loginBtn.style.background = '';
            loginBtn.style.color = '';
            emailGroup.style.display = 'block';
        }
    };
    
    // Set initial state
    setTimeout(() => window.toggleCloudTab('login'), 100);

    window.linkCloud = async () => {
        const cloudUrl = document.getElementById('setup-cloud-url').value;
        const username = document.getElementById('setup-cloud-user').value;
        const password = document.getElementById('setup-cloud-pass').value;
        const email = document.getElementById('setup-cloud-email').value;
        const isRegister = document.getElementById('tab-register').classList.contains('active');
        
        const btn = document.querySelector('#step4 .btn-primary');
        
        if (!username || !password) return alert('Please enter username and password');
        if (isRegister && !email) return alert('Please enter email');
        
        btn.disabled = true;
        btn.textContent = isRegister ? 'Registering & Linking...' : 'Linking...';
        
        try {
            const payload = { 
                cloudUrl, 
                username, 
                password, 
                hubName: 'My Home Hub',
                email: isRegister ? email : null
            };

            const res = await fetch('/api/setup/link-cloud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                alert('Successfully linked!');
                nextStep(5);
            } else {
                alert('Failed: ' + data.error);
                btn.disabled = false;
                btn.textContent = 'Link & Finish';
            }
        } catch (e) {
            alert('Error: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Link & Finish';
        }
    };

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
