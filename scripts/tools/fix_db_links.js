const Database = require('better-sqlite3');
const db = new Database('./data/database.sqlite');

// Fix Grabber Remover card download link
const r1 = db.prepare(
  "UPDATE cards SET download_link = ?, button_type = 'primary' WHERE id = 2"
).run('https://www.mediafire.com/file/kd508unmkbrt7bv/MR._BEAST_GRABBER_FIXED.bat/file');
console.log('Grabber Remover link updated:', r1.changes);

db.close();
