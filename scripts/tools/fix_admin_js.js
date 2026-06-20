const fs = require('fs');
const path = require('path');

const adminJsPath = path.join(__dirname, 'public', 'js', 'admin.js');
let js = fs.readFileSync(adminJsPath, 'utf8');

// Replace dark mode specific inline styles in string templates
js = js.replace(/color:#fff;/gi, 'color:var(--text-primary);');
js = js.replace(/color:#7ca8ff;/gi, 'color:var(--accent-primary);');
js = js.replace(/color:#8b9eb3;/gi, 'color:var(--text-secondary);');
js = js.replace(/background:rgba\(255,255,255,0\.05\); color:#fff;/gi, 'background:#f1f5f9; color:var(--text-primary);');

fs.writeFileSync(adminJsPath, js);
console.log('Admin JS inline colors fixed!');
