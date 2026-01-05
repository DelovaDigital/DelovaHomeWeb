const db = require('./script/db');

(async () => {
    try {
        const pool = await db.getPool();
        const result = await pool.request().query('SELECT * FROM Users');
        console.log('Users in DB:', result.recordset);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
