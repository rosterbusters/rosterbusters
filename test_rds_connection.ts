import { Client } from 'pg';
import * as fs from 'fs';
import * as dotenv from 'dotenv';


// Load environment variables from .env
dotenv.config();

async function main(): Promise<void> {
  const password: string = process.env.POSTGRES_PASSWORD || '<Enter_DB_Password>';
  
  const client = new Client({
    host: 'roster-db.crw6oeqwaggx.ap-southeast-1.rds.amazonaws.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { 
      rejectUnauthorized: false, 
      ca: fs.readFileSync('/home/ubuntu/rosterbusters/certs/global-bundle.pem').toString() 
    }
  });

  try {
    await client.connect();
    const res = await client.query('SELECT version()');
    console.log(res.rows[0].version);
    console.log('Database connection successful\n');

    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Test table created');

    // Insert test data
    await client.query(`
      INSERT INTO test_users (name, email) 
      VALUES 
        ('John Doe', 'john@example.com'),
        ('Jane Smith', 'jane@example.com')
      ON CONFLICT (email) DO NOTHING
    `);
    console.log('✓ Test data inserted');

    // Query the data
    const result = await client.query('SELECT * FROM test_users ORDER BY id');
    console.log('\nTest users in database:');
    console.table(result.rows);

  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(console.error);