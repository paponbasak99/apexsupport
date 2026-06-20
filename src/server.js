require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const session = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup SQLite Database
let defaultDbPath = path.join(__dirname, '../data/database.sqlite');
if (process.env.VERCEL) {
  defaultDbPath = '/tmp/database.sqlite';
}
const dbPath = process.env.DATABASE_PATH || defaultDbPath;
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Generate a random session secret if not provided
const SESSION_SECRET = process.env.SESSION_SECRET || 'apex_fallback_secret_key_1234567890';

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null, // Allow HTTP on local network (fixes mobile CSS bug)
    },
  },
  hsts: false, // Disable HSTS for local HTTP testing
  frameguard: { action: 'deny' },
  noSniff: true
})); 

app.use(cors());
app.use(express.json());

// Admin IP Whitelist & Device Auth Middleware
function requireAdminIP(req, res, next) {
  if (req.path === '/admin.html' || req.path.startsWith('/api/admin')) {
    const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (process.env.ALLOWED_ADMIN_IPS) {
      allowedIPs.push(...process.env.ALLOWED_ADMIN_IPS.split(',').map(ip => ip.trim()));
    }
    
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp && clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }
    
    const skipIPCheck = allowedIPs.includes('*') || process.env.DISABLE_ADMIN_IP_CHECK === 'true';
    
    if (!skipIPCheck && clientIp && !allowedIPs.includes(clientIp)) {
      console.warn(`[SECURITY] Blocked admin access from unauthorized IP: ${clientIp}`);
      return res.status(403).send(`
        <html>
          <body style="background: #06070d; color: #ef4444; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
            <div>
              <h1 style="font-size: 3rem; margin-bottom: 0;">403</h1>
              <h2>ACCESS DENIED</h2>
              <p style="color: #64748b;">Your IP Address (${clientIp}) is not authorized to view the Apex Console.</p>
            </div>
          </body>
        </html>
      `);
    }

    // --- DEVICE AUTHORIZATION LOCK ---
    const secretKey = process.env.ADMIN_SECRET_KEY || 'apex_secure_key';
    
    // 1. Check if user is authenticating device via URL
    if (req.query.auth === secretKey) {
      // Set a persistent cookie (Valid for 10 years)
      res.cookie('apex_device_auth', secretKey, { maxAge: 10 * 365 * 24 * 60 * 60 * 1000, httpOnly: true });
      // Redirect to clear the secret from the address bar
      return res.redirect(req.path);
    }
    
    // 2. Otherwise, check if device already has the persistent token
    const cookies = req.headers.cookie || '';
    if (!cookies.includes(`apex_device_auth=${secretKey}`)) {
      console.warn(`[SECURITY] Blocked admin access from unauthorized device.`);
      return res.status(403).send(`
        <html>
          <body style="background: #06070d; color: #ef4444; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
            <div>
              <h1 style="font-size: 3rem; margin-bottom: 0;">403</h1>
              <h2>UNAUTHORIZED DEVICE</h2>
              <p style="color: #64748b;">This specific browser/device has not been authorized to access the console.</p>
            </div>
          </body>
        </html>
      `);
    }
  }
  next();
}

app.use(requireAdminIP);

app.set('trust proxy', 1); // Trust first proxy (Render, Vercel, etc.)

// Session Middleware
app.use(session({
  name: 'apex_session',
  keys: [SESSION_SECRET],
  maxAge: 1000 * 60 * 60 * 24, // 1 day
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // Relax sameSite slightly to prevent issues with redirects
  httpOnly: true
}));

// Rate limiters
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many login attempts. Lockout 15m.' } });

app.use('/api/', apiLimiter);
app.use('/api/admin/login', authLimiter);

// --- Database Schema & Migration ---

// 1. Users
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'admin'
  );
`);

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
} catch (e) {
  console.error("Migration error:", e);
}

// 3. Activity Logs
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    target_type TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

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

// Seed default admin / update credentials
try {
  // Remove the old 'anu' user if it exists to clean up
  db.prepare('DELETE FROM users WHERE username = ?').run('anu');
  
  const paponUser = db.prepare('SELECT * FROM users WHERE username = ?').get('papon');
  const adminPassword = process.env.ADMIN_PASSWORD || '2580';
  const hash = bcrypt.hashSync(adminPassword, 10);
  if (!paponUser) {
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('papon', hash, 'admin');
    console.log(`Created default admin user (papon / ${adminPassword === '2580' ? '2580' : '******'})`);
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'papon');
    console.log("Verified admin credentials for papon");
  }
} catch (e) {
  console.error("Database seeding error:", e);
}

// --- Middlewares ---
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function verifyCSRF(req, res, next) {
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

function logActivity(userId, action, targetType, oldValue, newValue) {
  try {
    db.prepare('INSERT INTO activity_logs (user_id, action, target_type, old_value, new_value) VALUES (?, ?, ?, ?, ?)').run(
      userId, action, targetType, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null
    );
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}

app.delete('/api/admin/links/:id', requireAuth, verifyCSRF, (req, res) => {
  const { id } = req.params;
  
  try {
    const oldLink = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    if (!oldLink) return res.status(404).json({ error: 'Not found' });
    
    // Hard delete
    db.prepare('DELETE FROM links WHERE id = ?').run(id);
    // Also delete click logs so we don't violate foreign keys if they existed, but SQLite doesn't strictly enforce by default unless PRAGMA foreign_keys=ON
    db.prepare('DELETE FROM click_logs WHERE link_id = ?').run(id);
    
    logActivity(req.session.userId, 'DELETE', 'link', oldLink, null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Upload API ---
let defaultUploadDir = path.join(__dirname, '../public/assets/uploads');
if (process.env.VERCEL) {
  defaultUploadDir = '/tmp/uploads';
}
const uploadDir = process.env.UPLOAD_DIR || defaultUploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  }
});

app.post('/api/admin/upload', requireAuth, verifyCSRF, upload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = 'assets/uploads/' + req.file.filename;
    logActivity(req.session.userId, 'UPLOAD', 'image', null, { url: fileUrl });
    res.json({ success: true, url: fileUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Cards APIs ---
app.get('/api/cards', (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all();
    res.json(cards);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/cards', requireAuth, verifyCSRF, (req, res) => {
  const { section_id, title, logo_url, badge_text, accent_color, description, button_text, download_link, button_type } = req.body;
  if (!section_id || !title) return res.status(400).json({ error: 'Section ID and Title are required' });
  
  try {
    const stmt = db.prepare(`
      INSERT INTO cards (section_id, title, logo_url, badge_text, accent_color, description, button_text, download_link, button_type) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(section_id, title, logo_url, badge_text, accent_color || 'purple', description, button_text || 'Download', download_link, button_type || 'primary');
    
    logActivity(req.session.userId, 'CREATE', 'card', null, req.body);
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/cards/:id', requireAuth, verifyCSRF, (req, res) => {
  const { id } = req.params;
  const { section_id, title, logo_url, badge_text, accent_color, description, button_text, download_link, button_type } = req.body;
  
  try {
    const oldCard = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    if (!oldCard) return res.status(404).json({ error: 'Not found' });
    
    const stmt = db.prepare(`
      UPDATE cards SET 
        section_id = ?, title = ?, logo_url = ?, badge_text = ?, accent_color = ?, 
        description = ?, button_text = ?, download_link = ?, button_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(section_id, title, logo_url, badge_text, accent_color, description, button_text, download_link, button_type, id);
    
    logActivity(req.session.userId, 'UPDATE', 'card', oldCard, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/cards/:id', requireAuth, verifyCSRF, (req, res) => {
  const { id } = req.params;
  try {
    const oldCard = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    if (!oldCard) return res.status(404).json({ error: 'Not found' });
    
    db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    
    logActivity(req.session.userId, 'DELETE', 'card', oldCard, null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static files
app.use('/assets/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../public')));

// --- Auth APIs ---
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || 'admin'); 
  
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
  
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  
  logActivity(user.id, 'LOGIN', 'auth', null, null);
  res.json({ success: true, csrfToken: req.session.csrfToken, username: user.username });
});

app.post('/api/admin/logout', (req, res) => {
  if (req.session.userId) logActivity(req.session.userId, 'LOGOUT', 'auth', null, null);
  req.session = null;
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, csrfToken: req.session.csrfToken, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// --- Admin APIs ---

app.get('/api/admin/dashboard', requireAuth, (req, res) => {
  const totalClicks = db.prepare('SELECT SUM(clicks) as sum FROM links').get().sum || 0;
  // Get clicks over time (last 7 days approx, grouping by date)
  const clickTrends = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count 
    FROM click_logs 
    GROUP BY date 
    ORDER BY date DESC LIMIT 7
  `).all();
  const topLinks = db.prepare('SELECT label, clicks FROM links ORDER BY clicks DESC LIMIT 5').all();
  res.json({ totalClicks, topLinks, clickTrends });
});

app.get('/api/admin/activity', requireAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.username 
    FROM activity_logs a 
    LEFT JOIN users u ON a.user_id = u.id 
    ORDER BY a.created_at DESC LIMIT 50
  `).all();
  res.json(logs);
});

app.get('/api/admin/links', requireAuth, (req, res) => {
  const links = db.prepare('SELECT * FROM links ORDER BY label ASC').all();
  res.json(links);
});

app.post('/api/admin/links', requireAuth, verifyCSRF, (req, res) => {
  const { label, url, category, is_active } = req.body;
  if (!label) return res.status(400).json({ error: 'Label required' });
  
  // Basic URL Validation
  if (url && url !== '#' && !url.startsWith('/')) {
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
  }

  try {
    const info = db.prepare('INSERT INTO links (label, url, category, is_active, updated_by) VALUES (?, ?, ?, ?, ?)').run(
      label, url, category || 'Uncategorized', is_active === false ? 0 : 1, req.session.username
    );
    const newLink = db.prepare('SELECT * FROM links WHERE id = ?').get(info.lastInsertRowid);
    logActivity(req.session.userId, 'CREATE', 'link', null, newLink);
    res.json({ success: true, link: newLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/links/:id', requireAuth, verifyCSRF, (req, res) => {
  const { id } = req.params;
  const { label, url, category, is_active } = req.body;
  
  if (url && url !== '#' && !url.startsWith('/')) {
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
  }

  try {
    const oldLink = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    if (!oldLink) return res.status(404).json({ error: 'Not found' });
    
    db.prepare(`
      UPDATE links 
      SET label = ?, url = ?, category = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? 
      WHERE id = ?
    `).run(
      label || oldLink.label, 
      url || oldLink.url, 
      category || oldLink.category, 
      is_active !== undefined ? (is_active ? 1 : 0) : oldLink.is_active, 
      req.session.username,
      id
    );
    
    const newLink = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    logActivity(req.session.userId, 'UPDATE', 'link', oldLink, newLink);
    res.json({ success: true, link: newLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Public APIs ---

app.get('/api/links', (req, res) => {
  const rows = db.prepare('SELECT label, url FROM links WHERE is_active = 1').all();
  const linksObj = {};
  for (const row of rows) {
    linksObj[row.label] = row.url;
  }
  res.json(linksObj);
});

app.post('/api/track/:label', (req, res) => {
  const { label } = req.params;
  try {
    // Basic IP hash for deduplication
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const sessionHash = crypto.createHash('sha256').update(rawIp + new Date().toISOString().slice(0, 10)).digest('hex');

    const link = db.prepare('SELECT id FROM links WHERE label = ?').get(label);
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running!`);
    console.log(`- Main Website: http://localhost:${PORT}`);
    console.log(`- Admin Panel:  http://localhost:${PORT}/admin.html`);
  });
}

module.exports = app;

process.on('SIGINT', () => {
  db.close();
  process.exit();
});
