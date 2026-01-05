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

            <!-- Step 4: Create Account -->
            <div class="setup-step" id="step4">
                <div class="setup-icon"><i class="fas fa-user-shield"></i></div>
                <h2 class="setup-title" data-i18n="create_account">Create Admin Account</h2>
                <p class="setup-desc" data-i18n="create_account_desc">Create your local administrator account. You can also link it to the cloud for remote access.</p>
                
                <div style="max-width: 350px; margin: 0 auto 20px auto; text-align: left;">
                    <label style="display:block; margin-bottom:5px;" data-i18n="username">Username</label>
                    <input type="text" id="setup-user" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                    
                    <label style="display:block; margin-bottom:5px;" data-i18n="new_password">Password</label>
                    <input type="password" id="setup-pass" style="width:100%; padding:10px; margin-bottom:15px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">

                    <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px;">
                            <label style="margin:0; font-weight:bold;" data-i18n="enable_remote_access">Enable Remote Access (Cloud)</label>
                            <input type="checkbox" id="setup-cloud-enable" checked onchange="toggleCloudFields()" style="width:20px; height:20px;">
                        </div>
                        
                        <div id="cloud-fields">
                            <div style="display:flex; gap:10px; margin-bottom:15px;">
                                <button type="button" id="tab-login" class="btn-secondary active" onclick="toggleCloudTab('login')" style="flex:1;" data-i18n="login">Login</button>
                                <button type="button" id="tab-register" class="btn-secondary" onclick="toggleCloudTab('register')" style="flex:1;" data-i18n="register">Register</button>
                            </div>

                            <label style="display:block; margin-bottom:5px;" data-i18n="cloud_url">Cloud URL</label>
                            <input type="text" id="setup-cloud-url" value="https://cloud.delovahome.com" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                            
                            <div id="email-group" style="display:none;">
                                <label style="display:block; margin-bottom:5px;" data-i18n="email">Email</label>
                                <input type="email" id="setup-cloud-email" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:1px solid var(--border); background:var(--bg-input); color:var(--text);">
                            </div>
                            <p style="font-size: 0.8em; opacity: 0.7; margin-top: 5px;" data-i18n="cloud_credentials_note">We will use your local username/password for the cloud account.</p>
                        </div>
                    </div>
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(3)" data-i18n="back">Back</button>
                    <button class="btn-primary" onclick="createAccount()" data-i18n="create_finish">Create & Finish</button>
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

    window.toggleCloudFields = () => {
        const enabled = document.getElementById('setup-cloud-enable').checked;
        const fields = document.getElementById('cloud-fields');
        fields.style.display = enabled ? 'block' : 'none';
    };

    window.createAccount = async () => {
        const username = document.getElementById('setup-user').value;
        const password = document.getElementById('setup-pass').value;
        const cloudEnabled = document.getElementById('setup-cloud-enable').checked;
        
        const btn = document.querySelector('#step4 .btn-primary');
        
        if (!username || !password) return alert(window.t ? window.t('enter_username') : 'Please enter username and password');
        
        btn.disabled = true;
        btn.textContent = window.t ? window.t('creating_account') : 'Creating Account...';
        
        try {
            if (cloudEnabled) {
                // Cloud + Local
                const cloudUrl = document.getElementById('setup-cloud-url').value;
                const email = document.getElementById('setup-cloud-email').value;
                const isRegister = document.getElementById('tab-register').classList.contains('active');
                
                if (isRegister && !email) {
                    btn.disabled = false;
                    btn.textContent = window.t ? window.t('create_finish') : 'Create & Finish';
                    return alert(window.t ? window.t('enter_email') : 'Please enter email for cloud registration');
                }

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
                    alert(window.t ? window.t('account_created_linked') : 'Account created and Cloud linked successfully!');
                    nextStep(5);
                } else {
                    alert((window.t ? window.t('failed') : 'Failed') + ': ' + data.error);
                    btn.disabled = false;
                    btn.textContent = window.t ? window.t('create_finish') : 'Create & Finish';
                }
            } else {
                // Local Only
                const payload = { 
                    username, 
                    password, 
                    role: 'Admin'
                };

                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (data.ok) {
                    alert(window.t ? window.t('local_account_created') : 'Local Admin Account created successfully!');
                    nextStep(5);
                } else {
                    alert((window.t ? window.t('failed') : 'Failed') + ': ' + data.message);
                    btn.disabled = false;
                    btn.textContent = window.t ? window.t('create_finish') : 'Create & Finish';
                }
            }
        } catch (e) {
            alert((window.t ? window.t('error') : 'Error') + ': ' + e.message);
            btn.disabled = false;
            btn.textContent = window.t ? window.t('create_finish') : 'Create & Finish';
        }
    };

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
        localStorage.removeItem('setupRequired');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            window.location.reload(); 
        }, 500);
    };
}
