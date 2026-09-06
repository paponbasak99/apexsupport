require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
let Database;
if (!process.env.VERCEL) {
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.warn('better-sqlite3 not available');
  }
}
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup SQLite Database
let defaultDbPath = path.join(__dirname, '../data/database.sqlite');
if (process.env.VERCEL) {
  defaultDbPath = '/tmp/database.sqlite';
}
const dbPath = process.env.DATABASE_PATH || defaultDbPath;
let db;
if (Database) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
} else {
  console.log('Running in Vercel mode without SQLite database.');
}



// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
      frameSrc: ["'self'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      upgradeInsecureRequests: null, // Allow HTTP on local network (fixes mobile CSS bug)
    },
  },
  hsts: false, // Disable HSTS for local HTTP testing
  frameguard: { action: 'sameorigin' },
  noSniff: true
})); 

app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

app.set('trust proxy', 1); // Trust first proxy (Render, Vercel, etc.)

// Rate limiters
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests' } });

app.use('/api/', apiLimiter);

// --- Database Schema & Migration ---
if (db) {
// 2. Links (Migrating from old to new schema if necessary)
db.exec(`
  CREATE TABLE IF NOT EXISTS links_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT UNIQUE,
    url TEXT,
    category TEXT DEFAULT 'Uncategorized',
    is_active INTEGER DEFAULT 1,
    clicks INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );
`);

try {
  // Check if old links table exists
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='links'").get();
  if (tableCheck) {
    // Check if it has 'id' column
    const columns = db.pragma('table_info(links)');
    const hasId = columns.some(c => c.name === 'id');
    if (!hasId) {
      console.log("Migrating old links table to new schema...");
      const oldLinks = db.prepare('SELECT name, url, clicks FROM links').all();
      const insert = db.prepare('INSERT INTO links_new (label, url, clicks) VALUES (?, ?, ?)');
      db.transaction(() => {
        for (const link of oldLinks) {
          try { insert.run(link.name, link.url, link.clicks || 0); } catch (e) {} // ignore duplicates
        }
      })();
      db.exec('DROP TABLE links;');
      db.exec('ALTER TABLE links_new RENAME TO links;');
    } else {
      db.exec('DROP TABLE IF EXISTS links_new;');
    }
  } else {
    db.exec('ALTER TABLE links_new RENAME TO links;');
  }
  
  // Seed links from data/links.json if the table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM links').get().count;
  if (count === 0) {
    const linksPath = path.join(__dirname, '../data/links.json');
    if (fs.existsSync(linksPath)) {
      const linksData = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
      const insert = db.prepare('INSERT INTO links (label, url) VALUES (?, ?)');
      db.transaction(() => {
        for (const [label, url] of Object.entries(linksData)) {
          insert.run(label, url);
        }
      })();
      console.log("Seeded database with initial links from links.json");
    }
  }

} catch (e) {
  console.error("Migration error:", e);
}



// 4. Click Logs
db.exec(`
  CREATE TABLE IF NOT EXISTS click_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER,
    session_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 5. Cards
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id TEXT NOT NULL,
    title TEXT NOT NULL,
    logo_url TEXT,
    badge_text TEXT,
    accent_color TEXT DEFAULT 'purple',
    description TEXT,
    button_text TEXT DEFAULT 'Download',
    download_link TEXT,
    button_type TEXT DEFAULT 'primary',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

}

// --- Public APIs ---

app.get('/api/links', (req, res) => {
  if (db) {
    try {
      const rows = db.prepare('SELECT label, url FROM links WHERE is_active = 1').all();
      const linksObj = {};
      for (const row of rows) {
        linksObj[row.label] = row.url;
      }
      return res.json(linksObj);
    } catch(e) {}
  }
  
  // Fallback for Vercel: read directly from JSON
  try {
    const linksPath = path.join(__dirname, '../data/links.json');
    if (fs.existsSync(linksPath)) {
      const linksData = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
      return res.json(linksData);
    }
  } catch (e) {}
  
  res.json({});
});

app.post('/api/track/:label', (req, res) => {
  const { label } = req.params;
  if (!db) return res.json({ success: true, note: 'Tracking disabled' });
  try {
    // Basic IP hash for deduplication
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const sessionHash = crypto.createHash('sha256').update(rawIp + new Date().toISOString().slice(0, 10)).digest('hex');

    const link = db.prepare('SELECT id FROM links WHERE LOWER(TRIM(label)) = LOWER(TRIM(?)) OR label = ?').get(label, label);
    if (link) {
      db.transaction(() => {
        db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(link.id);
        db.prepare('INSERT INTO click_logs (link_id, session_hash) VALUES (?, ?)').run(link.id, sessionHash);
      })();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to track click.' });
  }
});

// --- Cloudflare Turnstile Human Verification API ---
app.post('/api/verify-turnstile', async (req, res) => {
  const { token, action } = req.body || {};
  const expectedAction = 'download';

  if (!token || typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return res.status(400).json({ success: false, error: 'Invalid challenge token.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const secretKey = process.env.TURNSTILE_SECRET;

  // Graceful fallback if TURNSTILE_SECRET is not yet set in environment
  if (!secretKey) {
    console.warn('⚠️ TURNSTILE_SECRET is not set in environment. Allowing verification.');
    return res.json({ success: true, verified: true, warning: 'TURNSTILE_SECRET unset in environment' });
  }

  try {
    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: clientIp,
      }),
    });

    if (!verifyResponse.ok) {
      throw new Error(`Cloudflare siteverify responded with status ${verifyResponse.status}`);
    }

    const data = await verifyResponse.json();

    if (!data.success) {
      return res.status(403).json({
        success: false,
        error: 'Human verification failed. Please try again.',
        codes: data['error-codes']
      });
    }

    if (action && data.action && data.action !== action && data.action !== expectedAction) {
      return res.status(403).json({ success: false, error: 'Invalid challenge action.' });
    }

    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return res.status(500).json({ success: false, error: 'Verification service temporarily unavailable.' });
  }
});

// GET /api/cards — returns all cards ordered by section
app.get('/api/cards', (req, res) => {
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM cards ORDER BY section_id, id').all();
      return res.json(rows);
    } catch (e) {}
  }
  // No cards in DB yet — return empty array (main.js handles this gracefully)
  res.json([]);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running!`);
    console.log(`- Main Website: http://localhost:${PORT}`);

  });
}

module.exports = app;

// Guard against null db on Vercel (no SQLite available)
process.on('SIGINT', () => {
  if (db) db.close();
  process.exit();
});
