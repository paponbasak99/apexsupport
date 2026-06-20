const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace neon text colors in inline styles
html = html.replace(/color:\s*#00e5cc/gi, 'color: #10b981'); // Cyan 'Working' to Green
html = html.replace(/color:\s*#ff3c3c/gi, 'color: #ef4444'); // Bright Red to normal Red
html = html.replace(/color:\s*#b388ff/gi, 'color: #2563eb'); // Light purple to Blue

// Replace badge backgrounds in inline styles
html = html.replace(/rgba\(236, 72, 153, 0\.1\)/gi, 'rgba(37, 99, 235, 0.1)'); // Pink bg to Blue bg
html = html.replace(/color:\s*var\(--pink\)/gi, 'color: var(--accent)'); // Pink text to Blue text

html = html.replace(/rgba\(217, 70, 239, 0\.1\)/gi, 'rgba(37, 99, 235, 0.1)'); // Purple bg to Blue bg
html = html.replace(/color:\s*var\(--purple\)/gi, 'color: var(--accent)'); // Purple text to Blue text

html = html.replace(/rgba\(0, 229, 204, 0\.1\)/gi, 'rgba(37, 99, 235, 0.1)'); // Cyan bg to Blue bg
html = html.replace(/color:\s*var\(--teal\)/gi, 'color: var(--accent)'); // Teal text to Blue text

html = html.replace(/rgba\(180, 60, 255, 0\.1\)/gi, 'rgba(37, 99, 235, 0.1)'); // Cyber purple bg to Blue bg
html = html.replace(/color:\s*var\(--cyber-purple\)/gi, 'color: var(--accent)'); // Cyber purple text to Blue text

html = html.replace(/rgba\(249, 115, 22, 0\.1\)/gi, 'rgba(37, 99, 235, 0.1)'); // Orange bg to Blue bg
html = html.replace(/color:\s*var\(--orange\)/gi, 'color: var(--accent)'); // Orange text to Blue text

fs.writeFileSync(indexPath, html);
console.log('Inline HTML colors fixed!');
