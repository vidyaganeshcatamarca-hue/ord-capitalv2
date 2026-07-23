const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(srcDir);
let changedFiles = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Pattern: t('key') || 'fallback string'
    // Also t("key") || "fallback string"
    // And {t('key') || 'fallback'}
    const regex1 = /t\(['"]([^'"]+)['"]\)\s*\|\|\s*['"][^'"]+['"]/g;
    
    if (regex1.test(content)) {
        content = content.replace(regex1, "t('$1')");
        fs.writeFileSync(file, content, 'utf-8');
        changedFiles++;
        console.log('Fixed fallback pattern in: ' + file);
    }
});

console.log('Total files fixed: ' + changedFiles);
