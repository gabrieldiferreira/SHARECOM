const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../messages');
const locales = ['pt-BR.json', 'en.json', 'es.json'];

function getKeys(obj, prefix = '') {
  return Object.keys(obj).reduce((res, el) => {
    if (Array.isArray(obj[el])) {
      return res;
    } else if (typeof obj[el] === 'object' && obj[el] !== null) {
      return [...res, ...getKeys(obj[el], prefix + el + '.')];
    }
    return [...res, prefix + el];
  }, []);
}

const allKeys = {};
let masterLocale = null;

// Read all locales
locales.forEach(locale => {
  const filePath = path.join(MESSAGES_DIR, locale);
  if (fs.existsSync(filePath)) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const keys = getKeys(content);
    allKeys[locale] = keys;
    if (!masterLocale) masterLocale = locale; // Use first found as master
  } else {
    console.error(`[ERROR] Missing locale file: ${locale}`);
  }
});

if (!masterLocale) process.exit(1);

let hasErrors = false;

// Compare others to master
locales.forEach(locale => {
  if (locale === masterLocale || !allKeys[locale]) return;
  
  const masterKeys = new Set(allKeys[masterLocale]);
  const localeKeys = new Set(allKeys[locale]);
  
  const missingInLocale = [...masterKeys].filter(x => !localeKeys.has(x));
  const extraInLocale = [...localeKeys].filter(x => !masterKeys.has(x));
  
  if (missingInLocale.length > 0) {
    hasErrors = true;
    console.error(`\n[MISSING in ${locale}]:`);
    missingInLocale.forEach(k => console.error(`  - ${k}`));
  }
  
  if (extraInLocale.length > 0) {
    hasErrors = true;
    console.error(`\n[EXTRA in ${locale}] (Missing in ${masterLocale}):`);
    extraInLocale.forEach(k => console.error(`  - ${k}`));
  }
});

if (!hasErrors) {
  console.log('✅ All translation files are perfectly synchronized!');
} else {
  console.error('\n❌ Translation synchronization failed. Please fix the missing/extra keys.');
  process.exit(1);
}
