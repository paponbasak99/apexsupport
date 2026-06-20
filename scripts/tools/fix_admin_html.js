const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'public', 'admin.html');
let html = fs.readFileSync(adminPath, 'utf8');

// Replace dark mode specific inline styles in admin.html
html = html.replace(/background:rgba\(0,0,0,0\.5\)/gi, 'background:#ffffff');
html = html.replace(/color:white;/gi, 'color:var(--text-primary);');
html = html.replace(/color:#fff;/gi, 'color:var(--text-primary);');
html = html.replace(/color:#fff/gi, 'color:var(--text-primary)');
html = html.replace(/background:rgba\(255,255,255,0\.05\)/gi, 'background:rgba(0,0,0,0.05)');
html = html.replace(/color:#000/gi, 'color:#ffffff');
html = html.replace(/border-color: rgba\(255,80,80,0\.2\)/gi, 'border-color: rgba(239, 68, 68, 0.2)');

fs.writeFileSync(adminPath, html);
console.log('Inline Admin HTML colors fixed!');
