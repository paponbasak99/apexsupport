const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data', 'database.sqlite');
const db = new Database(dbPath);

console.log('Connecting to database:', dbPath);

// Delete all existing users
const deleted = db.prepare('DELETE FROM users').run();
console.log(`Deleted ${deleted.changes} existing user(s).`);

// Insert new admin
const hash = bcrypt.hashSync('2580', 10);
db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('anu', hash, 'admin');

console.log('Successfully created new admin account: anu / 2580');
