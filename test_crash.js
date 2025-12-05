const db = require('./script/db');

async function test() {
    console.log('1. Requiring db...');
    console.log('2. db.sql is:', db.sql ? 'Defined' : 'Undefined');
    
    try {
        console.log('3. Connecting to pool...');
        const pool = await db.getPool();
        console.log('4. Connected.');
        
        console.log('5. Querying...');
        const res = await pool.request().query('SELECT 1 as val');
        console.log('6. Result:', res.recordset);
        
    } catch (err) {
        console.error('CAUGHT ERROR:', err);
    }
}

test().catch(err => console.error('FATAL:', err));
