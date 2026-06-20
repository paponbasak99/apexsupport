const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

async function checkUrl(url) {
  // Skip local anchors or empty links
  if (!url || url.startsWith('#') || url === '/' || url.startsWith('admin.html')) {
    return { status: 'Skip', type: 'Local' };
  }
  
  if (url.startsWith('/')) {
    // Local path, assume localhost:3000
    url = 'http://localhost:3000' + url;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000); // 10s timeout
    
    // Some sites reject HEAD, so we do a quick GET
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    return { 
      status: response.status, 
      redirected: response.redirected, 
      finalUrl: response.url,
      ok: response.ok
    };
  } catch (error) {
    return { status: 'Error', error: error.message };
  }
}

async function runAudit() {
  console.log('Starting Link Audit...');
  const indexHtmlPath = path.join(__dirname, '../public/index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // Extract all href attributes
  const hrefRegex = /href="([^"]+)"/g;
  let match;
  const siteLinks = new Set();
  while ((match = hrefRegex.exec(indexHtml)) !== null) {
    siteLinks.add(match[1]);
  }

  // Also extract links from database
  const dbPath = path.join(__dirname, '../data/database.sqlite');
  let dbLinks = [];
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    try {
      dbLinks = db.prepare('SELECT label, url FROM links').all();
    } catch (e) {
      console.log('No links table found yet or error reading DB:', e.message);
    }
    db.close();
  }

  console.log(`Found ${siteLinks.size} unique links in index.html`);
  console.log(`Found ${dbLinks.length} links in database`);

  const results = [];
  
  // Test site links
  for (const url of siteLinks) {
    console.log(`Testing: ${url}...`);
    const res = await checkUrl(url);
    results.push({ source: 'index.html', url, ...res });
  }

  // Test DB links
  for (const dbLink of dbLinks) {
    if (dbLink.url) {
      console.log(`Testing DB Link [${dbLink.label}]: ${dbLink.url}...`);
      const res = await checkUrl(dbLink.url);
      results.push({ source: `DB: ${dbLink.label}`, url: dbLink.url, ...res });
    }
  }

  // Cross reference
  const mismatchFlags = [];
  // For links in DB, does the domain match? (We might need more specifics, but let's check what the user asked for: 
  // "Flag any link whose destination domain doesn't match what's stored in the admin panel")
  // Since index.html has static links, and DB has links... Actually index.html doesn't hardcode the db links, the UI fetches them via API?
  // Wait, let's check index.html. Ah, the index.html might have hardcoded the discord links, and the DB also has links.

  let report = `# Link Audit Report\n\n`;
  report += `*Generated at: ${new Date().toISOString()}*\n\n`;
  
  report += `## Summary\n`;
  report += `- **Total Links Tested:** ${results.filter(r => r.status !== 'Skip').length}\n`;
  report += `- **Healthy (200 OK):** ${results.filter(r => r.ok).length}\n`;
  report += `- **Broken/Errors:** ${results.filter(r => !r.ok && r.status !== 'Skip').length}\n\n`;

  report += `## Detailed Results\n\n`;
  report += `| Source | URL | Status | Redirected To | Notes |\n`;
  report += `|---|---|---|---|---|\n`;

  for (const r of results) {
    if (r.status === 'Skip') continue;
    let notes = '';
    if (r.error) notes = r.error;
    if (r.redirected) notes = `Redirected`;
    
    let statusText = r.status;
    if (r.ok) statusText = `✅ ${r.status}`;
    else statusText = `❌ ${r.status}`;

    report += `| ${r.source} | ${r.url} | ${statusText} | ${r.redirected ? r.finalUrl : '-'} | ${notes} |\n`;
  }

  const artifactsPath = process.env.APPDATA_DIR || path.join(__dirname, '..'); 
  // We'll write this to the project root for now, or print it so we can put it in artifacts.
  const reportPath = path.join(__dirname, '../link_audit_report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`Report generated at: ${reportPath}`);
}

runAudit();
