const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting browser for logo closeup...");
  const browser = await puppeteer.launch({ 
    executablePath: '/usr/bin/google-chrome',
    headless: 'new', 
    args: ['--no-sandbox'] 
  });
  
  const page = await browser.newPage();
  
  // Mobile High Res
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  
  // Wait a few seconds for animations
  await new Promise(r => setTimeout(r, 5000));
  
  // Find the logo container (it has a specific shadow class)
  const logoSelector = 'div.w-16.h-16.overflow-hidden.rounded-2xl.border-2.border-purple-500\\/50';
  const logoElement = await page.$(logoSelector);
  
  if (logoElement) {
    await logoElement.screenshot({ path: '/var/home/gabrielferreira/UNiDoc/screenshots/logo_purple_card_closeup.png' });
    console.log("Logo closeup captured!");
  } else {
    // Fallback: capture just the center top area
    console.log("Could not find the exact selector, taking a crop of the top area...");
    await page.screenshot({ 
      path: '/var/home/gabrielferreira/UNiDoc/screenshots/logo_purple_card_closeup.png',
      clip: { x: 140, y: 350, width: 110, height: 110 } // Approximate location on mobile
    });
  }
  
  await browser.close();
  console.log("Done!");
})();
