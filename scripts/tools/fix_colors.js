const fs = require('fs');
const path = require('path');

const stylesPath = path.join(__dirname, 'public', 'css', 'styles.css');
let css = fs.readFileSync(stylesPath, 'utf8');

// Replace neon cyan
css = css.replace(/rgba\(0, 229, 204,/g, 'rgba(37, 99, 235,');
css = css.replace(/#00e5cc/g, '#2563eb');

// Replace cyber red
css = css.replace(/rgba\(255, 80, 80,/g, 'rgba(239, 68, 68,');
css = css.replace(/#ff5050/g, '#ef4444');

// Replace purple power
css = css.replace(/rgba\(180, 60, 255,/g, 'rgba(139, 92, 246,');
css = css.replace(/#b43cff/g, '#8b5cf6');

// Replace dark rgb backgrounds
css = css.replace(/rgba\(20, 24, 34/g, 'rgba(255, 255, 255');
css = css.replace(/rgba\(10, 12, 18/g, 'rgba(240, 240, 240');
css = css.replace(/rgba\(9, 10, 15/g, 'rgba(255, 255, 255');
css = css.replace(/rgba\(13, 17, 23/g, 'rgba(255, 255, 255');
css = css.replace(/rgba\(18, 25, 40/g, 'rgba(255, 255, 255');
css = css.replace(/rgba\(28, 38, 58/g, 'rgba(240, 240, 240');
css = css.replace(/rgba\(0, 0, 0, 0\.8\)/g, 'rgba(0, 0, 0, 0.1)');
css = css.replace(/rgba\(0, 0, 0, 0\.95\)/g, 'rgba(255, 255, 255, 0.95)');

// Replace dark hex colors often used for borders and backgrounds
css = css.replace(/#080b14/g, '#f8fafc');
css = css.replace(/#05070e/g, '#f1f5f9');
css = css.replace(/#030409/g, '#e2e8f0');
css = css.replace(/#090a0f/g, '#ffffff');

// Also update home-redesign.css
const homeRedesignPath = path.join(__dirname, 'public', 'css', 'home-redesign.css');
let homeCss = fs.readFileSync(homeRedesignPath, 'utf8');
homeCss = homeCss.replace(/rgba\(0, 229, 204,/g, 'rgba(37, 99, 235,');
homeCss = homeCss.replace(/#00e5cc/g, '#2563eb');
homeCss = homeCss.replace(/rgba\(9, 10, 15/g, 'rgba(255, 255, 255');
homeCss = homeCss.replace(/rgba\(13, 17, 27/g, 'rgba(255, 255, 255');
fs.writeFileSync(homeRedesignPath, homeCss);

fs.writeFileSync(stylesPath, css);
console.log('Colors replaced successfully!');
