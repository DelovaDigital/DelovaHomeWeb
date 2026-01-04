const cron = require('node-cron');

console.log('--- Cron Test Start ---');
console.log('Current Server Time:', new Date().toString());

// Schedule for the next minute
const now = new Date();
const nextMinute = new Date(now.getTime() + 60000);
const m = nextMinute.getMinutes();
const h = nextMinute.getHours();

const cronString = `0 ${m} ${h} * * *`;
console.log(`Scheduling test task for: ${cronString} (Current time: ${now.toLocaleTimeString()})`);

const task = cron.schedule(cronString, () => {
    console.log('!!! CRON TASK FIRED !!!');
    console.log('Fired at:', new Date().toString());
    process.exit(0);
});

console.log('Waiting for task to fire...');

// Timeout after 2 minutes
setTimeout(() => {
    console.log('Test timed out - Cron did not fire.');
    process.exit(1);
}, 125000);
