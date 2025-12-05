const db = require('./script/db');
const sql = require('mssql');

async function runDebug() {
    console.log('Starting DB Debug...');
    try {
        const pool = await db.getPool();
        console.log('Connected to DB.');

        // Check if table exists
        const tableRes = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SystemConfig'");
        console.log('Table check result:', tableRes.recordset);

        if (tableRes.recordset.length === 0) {
            console.log('Table SystemConfig does not exist. Attempting to create...');
            try {
                await pool.request().query(`
                    CREATE TABLE SystemConfig (
                        KeyName NVARCHAR(50) PRIMARY KEY,
                        KeyValue NVARCHAR(255)
                    )
                `);
                console.log('Successfully created SystemConfig table.');
            } catch (createErr) {
                console.error('Error creating table:', createErr);
            }
        } else {
            console.log('Table SystemConfig exists.');
        }

        // Check content
        const contentRes = await pool.request().query("SELECT * FROM SystemConfig");
        console.log('Current content of SystemConfig:', contentRes.recordset);

        // Try to insert if empty
        if (contentRes.recordset.length === 0) {
             console.log('Table is empty. Attempting to insert test data...');
             try {
                await pool.request()
                    .input('key', sql.NVarChar, 'HubId')
                    .input('val', sql.NVarChar, 'DEBUG-TEST-ID')
                    .query("INSERT INTO SystemConfig (KeyName, KeyValue) VALUES (@key, @val)");
                console.log('Inserted test data.');
             } catch (insertErr) {
                 console.error('Error inserting data:', insertErr);
             }
        }

    } catch (err) {
        console.error('General DB Error:', err);
    } finally {
        console.log('Debug finished.');
        process.exit();
    }
}

runDebug();
