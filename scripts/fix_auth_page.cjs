const fs = require('fs');
const path = require('path');

const esTsPath = path.join(__dirname, '../src/locales/es.ts');
const pagePath = path.join(__dirname, '../src/pages/Auth/AuthPage.tsx');

const newKeys = {
  auth_cycle_preview_same_month: "Tu ciclo irá del 1 de {currentMonth} al {lastDay} de {currentMonth}.",
  auth_cycle_preview_diff_month: "Tu ciclo irá del {startDay} de {currentMonth} al {endDay} de {nextMonth}.",
  auth_day: "Día",
};

let esTsContent = fs.readFileSync(esTsPath, 'utf8');
let keysToAdd = [];
for (const [key, value] of Object.entries(newKeys)) {
  if (!esTsContent.includes(key + ':')) {
    keysToAdd.push(`  ${key}: "${value}",`);
  }
}
if (keysToAdd.length > 0) {
  const appendBlock = `\n  // Refactor AuthPage\n${keysToAdd.join('\n')}\n`;
  esTsContent = esTsContent.replace(/};\s*$/g, appendBlock + '};\n');
  fs.writeFileSync(esTsPath, esTsContent, 'utf8');
  console.log(`Added ${keysToAdd.length} keys to es.ts`);
}

let pageContent = fs.readFileSync(pagePath, 'utf8');
const replacements = [
  { search: /`Tu ciclo irá del 1 de \$\{currentMonth\} al \$\{lastDayCurrent\} de \$\{currentMonth\}\.`/g, replace: "t('auth_cycle_preview_same_month', { currentMonth, lastDay: lastDayCurrent })" },
  { search: /`Tu ciclo irá del \$\{anchorDay\} de \$\{currentMonth\} al \$\{endDay\} de \$\{nextMonth\}\.`/g, replace: "t('auth_cycle_preview_diff_month', { startDay: anchorDay, currentMonth, endDay, nextMonth })" },
  { search: 'Día <span className="anchor-day-number">{anchorDay}</span>', replace: '{t("auth_day")} <span className="anchor-day-number">{anchorDay}</span>' },
];

replacements.forEach(({ search, replace }) => {
  if (typeof search === 'string') {
    pageContent = pageContent.split(search).join(replace);
  } else {
    pageContent = pageContent.replace(search, replace);
  }
});

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Updated AuthPage.tsx');
