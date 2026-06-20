const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data/database.sqlite');
const db = new Database(dbPath);

const hash = bcrypt.hashSync('1', 10);
db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = 1').run('1', hash);

console.log("Admin credentials successfully updated to username: 1, password: 1");
