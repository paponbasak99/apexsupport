const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const styles = fs.readFileSync('public/css/styles.css', 'utf8');
const homeRedesign = fs.readFileSync('public/css/home-redesign.css', 'utf8');

console.log('=== AUDIT REPORT: MOBILE EXPERIENCE ===\n');

// 1. Check Viewport
const viewportMatch = html.match(/<meta\s+name=["']viewport["'][^>]*>/i);
console.log('1. Viewport Meta:', viewportMatch ? viewportMatch[0] : 'MISSING');

// 2. Inline widths in HTML
console.log('\n2. Inline width attributes in index.html:');
const inlineWidths = html.match(/style=["'][^"']*(?:width|min-width|max-width)[^"']*["']/gi) || [];
inlineWidths.forEach(w => console.log('   -', w));

// 3. Check Nav Links and Hamburger Toggle
console.log('\n3. Nav items count:');
const navItems = html.match(/<ul[^>]*id=["']nav-links["'][^>]*>[\s\S]*?<\/ul>/i);
if (navItems) {
  const lis = navItems[0].match(/<li[\s\S]*?<\/li>/gi) || [];
  console.log('   Total nav items:', lis.length);
}

// 4. Check Modals
console.log('\n4. Modals in HTML:');
const modalIds = ['opt-modal', 'sensi-modal', 'tutorial-modal'];
modalIds.forEach(id => {
  const exists = html.includes(`id="${id}"`);
  console.log(`   - #${id}: ${exists ? 'Found' : 'MISSING'}`);
});

// 5. Check Section IDs
console.log('\n5. Page sections:');
const sections = html.match(/<section[^>]*id=["']([^"']+)["'][^>]*class=["'][^"']*page[^"']*["']/gi) || [];
sections.forEach(s => console.log('   -', s.trim()));
