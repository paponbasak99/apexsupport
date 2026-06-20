const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

function isObfuscated(code) {
    return code.includes('_0x') && code.length > 50000;
}

// Read original script
const jsDir = path.join(__dirname, '../public/js');
const scriptPath = path.join(jsDir, 'script.js');
const backupPath = path.join(jsDir, 'script.backup.js');

let originalCode = fs.readFileSync(scriptPath, 'utf8');

if (isObfuscated(originalCode)) {
    console.log('⚠️  Warning: script.js appears to be already obfuscated. Attempting to restore from backup...');
    if (fs.existsSync(backupPath)) {
        const backupCode = fs.readFileSync(backupPath, 'utf8');
        if (!isObfuscated(backupCode)) {
            console.log('✅ Found valid human-readable backup. Restoring script.js...');
            fs.writeFileSync(scriptPath, backupCode);
            originalCode = backupCode;
        } else {
            console.error('❌ Error: Both script.js and script.backup.js are obfuscated! Cannot proceed.');
            process.exit(1);
        }
    } else {
        console.error('❌ Error: script.js is obfuscated and no backup file exists!');
        process.exit(1);
    }
}

// Obfuscate with high protection
const obfuscationResult = JavaScriptObfuscator.obfuscate(originalCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 4000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
});

// Save obfuscated code
fs.writeFileSync(path.join(jsDir, 'script.obfuscated.js'), obfuscationResult.getObfuscatedCode());

// Backup original
fs.copyFileSync(path.join(jsDir, 'script.js'), path.join(jsDir, 'script.backup.js'));

// Replace original with obfuscated
fs.writeFileSync(path.join(jsDir, 'script.js'), obfuscationResult.getObfuscatedCode());

console.log('✅ JavaScript code successfully obfuscated!');
console.log('📁 Original script saved as script.backup.js');
console.log('📁 Obfuscated script is now script.js');
