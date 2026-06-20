const fs = require('fs');
const path = require('path');

const stylesPath = path.join(__dirname, 'public', 'css', 'styles.css');
let css = fs.readFileSync(stylesPath, 'utf8');

// Replace white borders/shadows/shimmers with black ones for light mode
css = css.replace(/rgba\(255, 255, 255, 0\.05\)/g, 'rgba(0, 0, 0, 0.05)');
css = css.replace(/rgba\(255, 255, 255, 0\.06\)/g, 'rgba(0, 0, 0, 0.06)');
css = css.replace(/rgba\(255, 255, 255, 0\.08\)/g, 'rgba(0, 0, 0, 0.08)');
css = css.replace(/rgba\(255, 255, 255, 0\.1\)/g, 'rgba(0, 0, 0, 0.1)');
css = css.replace(/rgba\(255, 255, 255, 0\.15\)/g, 'rgba(0, 0, 0, 0.15)');
css = css.replace(/rgba\(255, 255, 255, 0\.2\)/g, 'rgba(0, 0, 0, 0.2)');
css = css.replace(/rgba\(255, 255, 255, 0\.25\)/g, 'rgba(0, 0, 0, 0.25)');
css = css.replace(/rgba\(255, 255, 255, 0\.3\)/g, 'rgba(0, 0, 0, 0.3)');
css = css.replace(/rgba\(255, 255, 255, 0\.4\)/g, 'rgba(0, 0, 0, 0.4)');
css = css.replace(/rgba\(255, 255, 255, 0\.5\)/g, 'rgba(0, 0, 0, 0.5)');

// Replace hardcoded white text
// Be careful with replacing #ffffff as it's the new card background, 
// so only replace it where it's used as text color inside components.
// We'll replace it specifically where it says "color: #ffffff" to "color: var(--text)"
css = css.replace(/color: #ffffff/g, 'color: var(--text)');
css = css.replace(/color: #fff/g, 'color: var(--text)');
css = css.replace(/color: #f0f2f5/g, 'color: var(--text)');
css = css.replace(/color: #a3b8cc/g, 'color: var(--text-secondary)');
css = css.replace(/color: #8b9eb3/g, 'color: var(--text-secondary)');
css = css.replace(/color: #e2e8f0/g, 'color: var(--text)');

// In case we messed up some component background that should be white 
// (e.g. background: var(--text) would be black), we ONLY replaced `color: #ffffff`.

// Now do the same for home-redesign.css
const homeRedesignPath = path.join(__dirname, 'public', 'css', 'home-redesign.css');
let homeCss = fs.readFileSync(homeRedesignPath, 'utf8');

homeCss = homeCss.replace(/rgba\(255, 255, 255, 0\.05\)/g, 'rgba(0, 0, 0, 0.05)');
homeCss = homeCss.replace(/rgba\(255, 255, 255, 0\.08\)/g, 'rgba(0, 0, 0, 0.08)');
homeCss = homeCss.replace(/rgba\(255, 255, 255, 0\.1\)/g, 'rgba(0, 0, 0, 0.1)');
homeCss = homeCss.replace(/rgba\(255, 255, 255, 0\.15\)/g, 'rgba(0, 0, 0, 0.15)');
homeCss = homeCss.replace(/rgba\(255, 255, 255, 0\.2\)/g, 'rgba(0, 0, 0, 0.2)');

fs.writeFileSync(stylesPath, css);
fs.writeFileSync(homeRedesignPath, homeCss);

console.log('White borders and text fixed!');
