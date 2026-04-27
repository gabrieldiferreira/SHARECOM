const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ 
    executablePath: '/usr/bin/google-chrome',
    headless: 'new', 
    args: ['--no-sandbox'] 
  });
  
  const page = await browser.newPage();
  
  // Reset Password Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000/reset-password', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '/var/home/gabrielferreira/UNiDoc/screenshots/reset_password_mobile.png' });
  
  // Reset Password Desktop
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3000/reset-password', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '/var/home/gabrielferreira/UNiDoc/screenshots/reset_password_fullhd.png' });
  
  await browser.close();
  console.log("More screenshots captured!");
})();
