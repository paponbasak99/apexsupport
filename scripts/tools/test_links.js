const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data/database.sqlite');
const db = new Database(dbPath);
const links = db.prepare('SELECT * FROM links').all();
console.log('Links:', links);
