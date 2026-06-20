const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data/database.sqlite');
const db = new Database(dbPath);
const user = db.prepare('SELECT * FROM users').get();
console.log("User:", user);
if (user) {
  const isValid = bcrypt.compareSync('anuex', user.password_hash);
  console.log("Matches 'anuex':", isValid);
  const isValid2 = bcrypt.compareSync('1', user.password_hash);
  console.log("Matches '1':", isValid2);
}
