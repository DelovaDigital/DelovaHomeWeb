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
                <h2 class="setup-title">Welcome to DelovaHome</h2>
                <p class="setup-desc">Your smart home journey starts here. Let's get you set up in just a few seconds.</p>
                <div class="setup-actions">
                    <button class="btn-primary" onclick="nextStep(2)">Get Started</button>
                </div>
            </div>

            <!-- Step 2: Theme -->
            <div class="setup-step" id="step2">
                <div class="setup-icon"><i class="fas fa-palette"></i></div>
                <h2 class="setup-title">Choose your Theme</h2>
                <p class="setup-desc">Select the look that fits your style.</p>
                
                <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 30px;">
                    <div class="theme-option" onclick="setTheme('light')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: #f8fafc; color: #333;">
                        <i class="fas fa-sun" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <div>Light</div>
                    </div>
                    <div class="theme-option" onclick="setTheme('dark')" style="cursor: pointer; padding: 15px; border: 2px solid transparent; border-radius: 10px; background: #1e293b; color: white;">
                        <i class="fas fa-moon" style="font-size: 2rem; margin-bottom: 10px;"></i>
                        <div>Dark</div>
                    </div>
                </div>

                <div class="setup-actions">
                    <button class="btn-secondary" onclick="nextStep(1)">Back</button>
                    <button class="btn-primary" onclick="nextStep(3)">Next</button>
                </div>
            </div>

            <!-- Step 3: Finish -->
            <div class="setup-step" id="step3">
                <div class="setup-icon"><i class="fas fa-check-circle"></i></div>
                <h2 class="setup-title">You're All Set!</h2>
                <p class="setup-desc">DelovaHome is ready to manage your devices. Explore the dashboard to get started.</p>
                <div class="setup-actions">
                    <button class="btn-primary" onclick="finishSetup()">Go to Dashboard</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Expose functions to global scope for onclick handlers
    window.nextStep = (stepNum) => {
        document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
        document.getElementById(`step${stepNum}`).classList.add('active');
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
        document.querySelectorAll('.theme-option').forEach(el => el.style.borderColor = 'transparent');
        const selected = theme === 'light' ? 0 : 1; // 0 is light, 1 is dark in the DOM order
        document.querySelectorAll('.theme-option')[selected].style.borderColor = 'var(--primary)';
    };
    
    window.finishSetup = () => {
        localStorage.removeItem('setupRequired');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            // Optional: Reload to ensure everything is fresh, or just let them use it
            // window.location.reload(); 
        }, 500);
    };
}
