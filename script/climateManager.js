const EventEmitter = require('events');
const fetch = require('node-fetch');
const deviceManager = require('./deviceManager');
const presenceManager = require('./presenceManager');

// Open-Meteo API (Brussels default)
const LAT = 50.8503;
const LON = 4.3517;
const WEATHER_API = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,direct_radiation`;

class ClimateManager extends EventEmitter {
    constructor() {
        super();
        this.weather = {
            temp: 0,
            wind: 0,
            code: 0,
            isDay: 1,
            lastUpdate: 0
        };
        this.mode = 'AUTO'; // AUTO, MANUAL
        this.thermostatSetpoints = {
            home: 21,
            away: 16,
            sleep: 18,
            guest: 22
        };

        // Tasks
        this.startWeatherService();
        this.startAutomationLoop();

        // Listeners
        presenceManager.on('home-state-changed', (state) => this.handlePresenceChange(state));
    }

    async startWeatherService() {
        console.log('[Climate] Starting Weather Service...');
        await this.fetchWeather();
        setInterval(() => this.fetchWeather(), 30 * 60 * 1000); // Every 30 mins
    }

    async fetchWeather() {
        try {
            const res = await fetch(WEATHER_API);
            const data = await res.json();
            if (data.current) {
                this.weather = {
                    temp: data.current.temperature_2m,
                    wind: data.current.wind_speed_10m,
                    code: data.current.weather_code,
                    isDay: data.current.is_day,
                    lastUpdate: Date.now()
                };
                console.log(`[Climate] Weather updated: ${this.weather.temp}°C, Wind: ${this.weather.wind}km/h`);
                this.emit('weather-updated', this.weather);
                this.checkSafety(); // Storm check immediately
            }
        } catch (e) {
            console.error('[Climate] Failed to fetch weather:', e.message);
        }
    }

    startAutomationLoop() {
        setInterval(() => {
            this.runOptimization();
        }, 15 * 60 * 1000); // Run logic every 15 mins
    }

    // --- Safety Logic ---
    async checkSafety() {
        // High Wind Safety for Blinds/Awnings
        if (this.weather.wind > 50) {
            console.warn(`[Climate] High Wind Alert (${this.weather.wind} km/h). Retracting external blinds.`);
            await this.retractBlinds();
        }
    }

    async retractBlinds() {
        // Find all devices of type 'blind' or 'awning'
        // This relies on deviceManager exposing devices
        // For simulation, we'll iterate known list
        const devices = deviceManager.devices; 
        for (const [id, dev] of devices) {
            if (dev.type === 'blind' || dev.type === 'awning' || dev.name.toLowerCase().includes('zonwering')) {
                console.log(`[Climate] Retracting ${dev.name} due to wind.`);
                deviceManager.controlDevice(id, 'open'); // Assuming 'open' means retracted/safe
            }
        }
    }

    // --- Comfort Logic ---
    handlePresenceChange(state) {
        if (this.mode !== 'AUTO') return;

        let targetTemp = this.thermostatSetpoints.home;

        if (state === 'away') {
            targetTemp = this.thermostatSetpoints.away;
            console.log('[Climate] House Empty. Setting Eco Temp (16°C).');
        } else if (state === 'sleep') {
            targetTemp = this.thermostatSetpoints.sleep;
        }

        this.setAllThermostats(targetTemp);
    }

    async runOptimization() {
        if (this.mode !== 'AUTO') return;

        // Sun Protection (Summer)
        // If Temp > 22 AND Day AND Clear Sky -> Close Blinds partial
        if (this.weather.temp > 22 && this.weather.isDay && this.weather.code <= 1) {
            console.log('[Climate] High Temp & Sun detected. Closing blinds for cooling.');
            this.setBlindsPosition(50); // 50% closed
        }
        
        // Solar Gain (Winter)
        // If Temp < 10 AND Day AND Clear Sky -> Open Blinds (Free heat)
        if (this.weather.temp < 10 && this.weather.isDay && this.weather.code <= 1) {
            console.log('[Climate] Cold & Sun detected. Opening blinds for solar gain.');
            this.setBlindsPosition(0); // Fully open
        }
    }

    async setAllThermostats(temp) {
        const devices = deviceManager.devices;
        for (const [id, dev] of devices) {
            if (dev.type === 'thermostat' || dev.capabilities.includes('thermostat')) {
                deviceManager.controlDevice(id, 'set_temp', temp);
            }
        }
    }

    async setBlindsPosition(pos) {
        // Only automate if we haven't manually overrided recently? (Not impl yet)
        const devices = deviceManager.devices;
        for (const [id, dev] of devices) {
             if (dev.type === 'blind') {
                deviceManager.controlDevice(id, 'set_position', pos);
            }
        }
    }
}

module.exports = new ClimateManager();
