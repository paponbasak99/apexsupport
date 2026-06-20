const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../../public/index.html');
let content = fs.readFileSync(indexPath, 'utf8');

// Order required: home, panel-issue, bypass-issue, internal-fix, emulator, paid-sensi, other-issues
const targetOrder = [
  'home',
  'panel-issue',
  'bypass-issue',
  'internal-fix',
  'emulator',
  'paid-sensi',
  'other-issues'
];

// Extract the navbar links and reorder them
const navLinksRegex = /<ul class="nav__links" id="nav-links">([\s\S]*?)<\/ul>/;
const navMatch = content.match(navLinksRegex);
if (navMatch) {
  const ulContent = navMatch[1];
  const listItems = ulContent.split('</li>').filter(li => li.trim().length > 0).map(li => li + '</li>');
  
  const orderedListItems = [];
  for (const id of targetOrder) {
    const item = listItems.find(li => li.includes(`data-link="${id}"`));
    if (item) orderedListItems.push(item);
  }
  
  // also add any that were missed
  for (const li of listItems) {
    if (!orderedListItems.includes(li)) orderedListItems.push(li);
  }
  
  // Ensure we keep indentation nice
  const newUlContent = '\n' + orderedListItems.map(item => '          ' + item.trim()).join('\n') + '\n        ';
  content = content.replace(navMatch[1], newUlContent);
}

// Extract the sections (assuming no nested <section> tags)
const sectionRegex = /<section id="([^"]+)" class="page">([\s\S]*?)<\/section>/g;
const sections = {};
let match;
while ((match = sectionRegex.exec(content)) !== null) {
  sections[match[1]] = match[0];
}

// Rebuild the main content area
const mainRegex = /<main id="content">([\s\S]*?)<\/main>/;
const mainMatch = content.match(mainRegex);

if (mainMatch) {
  let newMainContent = '\n';
  for (const id of targetOrder) {
    if (sections[id]) {
      newMainContent += '      ' + sections[id] + '\n\n';
    }
  }
  
  // add any remaining sections not specified in targetOrder just in case
  for (const id in sections) {
    if (!targetOrder.includes(id)) {
      newMainContent += '      ' + sections[id] + '\n\n';
    }
  }
  
  content = content.replace(mainMatch[1], newMainContent);
}

fs.writeFileSync(indexPath, content, 'utf8');
console.log('Successfully reordered index.html sections and navbar!');
