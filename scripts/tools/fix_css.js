const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'styles.css');
let css = fs.readFileSync(cssPath, 'utf8');

css = css.replace(/\.card {[\s\S]*?transition:.*?;[\s\S]*?}/m, 
`.card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: var(--radius-lg);
  background: rgba(13, 17, 23, 0.55);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  isolation: isolate;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease, border-color 0.35s ease;
}`);

css = css.replace(/\.card:hover {[\s\S]*?}/m,
`.card:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}`);

const connectingCSS = `
.btn--download.connecting {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.05);
  cursor: wait;
}
`;
if (!css.includes('.btn--download.connecting')) {
    css = css.replace('/* Download button specific animation */', '/* Download button specific animation */\n' + connectingCSS);
}

if (!css.includes('gradientPulse')) {
    css += `
.gradient-text {
  background: linear-gradient(90deg, #00e5cc, #b43cff, #00e5cc);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradientPulse 3s linear infinite;
}
@keyframes gradientPulse {
  to { background-position: 200% center; }
}
`;
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('Updated styles.css');
