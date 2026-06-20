const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// Remove the APK nav link
content = content.replace(/.*<li><a href="#apk" data-link="apk">APK<\/a><\/li>\r?\n/g, '');

// Remove the APK section
content = content.replace(/<section id="apk" class="page">[\s\S]*?<\/section>\r?\n\r?\n?/g, '');

fs.writeFileSync(path, content);
console.log('APK section and link removed successfully.');
