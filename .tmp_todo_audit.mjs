import { glob } from 'glob';
import fs from 'fs';
import path from 'path';

const srcDir = process.cwd();
const pattern = /\b(TODO|FIXME|HACK|XXX)\s*[:.-]?\s*(.*)/i;
const filePattern = '**/{src/**/*.{ts,tsx,js,jsx}}'; // but we need to exclude node_modules and dist

// We'll manually traverse to respect ES imports from this script's dir

import { readFile } from 'fs/promises';

async function auditMarkers(dir) {
    const results = [];
    const excludedDirs = new Set(['node_modules', 'dist', '.cache']);

    async function walk(current) {
        try {
            const items = await fs.promises.readdir(current);
            for (const item of items) {
                const fullPath = path.join(current, item);
                const stat = await fs.promises.stat(fullPath);
                
                if (stat.isDirectory()) {
                    // skip excluded dirs
                    if (excludedDirs.has(item)) continue;
                    await walk(fullPath);
                } else {
                    // check file extension
                    if (!['.ts', '.tsx', '.js', '.jsx'].includes(path.extname(item))) continue;
                    
                    const content = await readFile(fullPath, 'utf8');
                    const lines = content.split('\n');
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const m = pattern.exec(line);
                        if (m) {
                            const startIdx = Math.max(0, i - 3);
                            const endIdx = Math.min(lines.length, i + 4);
                            const context = lines.slice(startIdx, endIdx).join('\n');
                            
                            results.push({
                                file: path.relative(srcDir, fullPath),
                                line: i + 1,
                                marker: m[1].toUpperCase(),
                                text: (m.lastIndex > m.index) ? `: ${m[2] ? m[2].trim() : '(no specific text)'}` : '',
                                fullLine: line.trim(),
                                context
                            });
                            // Reset index for next match on next iteration would need to reset regex lastIndex manually, but we can just use a new pattern each time or simpler regex. Since lines may contain multiple matches (unlikely), we can break after one per line; else while loop but rare, so assume once.
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error walking', dir, err.message);
        }
    }

    await walk(dir);
    console.log(`\n=== TOTAL MATCHES: ${results.length} ===`);
    for (const r of results) {
        const markerText = !r.text ? ' [NO TEXT]' : '';
        console.log(`\n### ${r.file}:${r.line}`);
        console.log(`MARKER: ${r.marker}${markerText}`);
        console.log(`FULL LINE:\n${r.fullLine}`);
        console.log('\n--- CONTEXT ---');
        console.log(r.context);
    }

    // Print a summary table (actionable, stale, permanent, false positive) TBD after classification.

    return results;
}

// Run in the current working directory where script is executed
auditMarkers(srcDir).catch(console.error);