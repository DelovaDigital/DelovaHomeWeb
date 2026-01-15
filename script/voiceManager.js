class VoiceManager {
    constructor() {
        this.integrations = {
            alexa: false,
            google: false,
            local: true
        };
        this.commandHooks = {};
    }

    registerCommand(phrase, callback) {
        this.commandHooks[phrase.toLowerCase()] = callback;
    }

    async processVoiceCommand(text, source) {
        console.log(`VoiceManager: Processing '${text}' from ${source}`);
        const lowerText = text.toLowerCase();
        
        // Basic exact match for now, would use NLP/Fuzzy match here
        for (const [phrase, callback] of Object.entries(this.commandHooks)) {
            if (lowerText.includes(phrase)) {
                try {
                    await callback();
                    return { success: true, message: `Executed: ${phrase}` };
                } catch (e) {
                    console.error(e);
                    return { success: false, message: 'Command failed' };
                }
            }
        }
        return { success: false, message: 'Command not understood' };
    }
}

module.exports = new VoiceManager();
