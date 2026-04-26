const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ 
    executablePath: '/usr/bin/google-chrome',
    headless: 'new', 
    args: ['--no-sandbox'] 
  });
  
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem("pwa-install-dismissed", "1");
  });
  
  console.log("Capturing Desktop Full HD...");
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 15000));
  await page.screenshot({ path: '/var/home/gabrielferreira/UNiDoc/screenshots/login_fullhd.png', fullPage: true });
  
  console.log("Capturing Mobile High Res...");
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 15000));
  await page.screenshot({ path: '/var/home/gabrielferreira/UNiDoc/screenshots/login_mobile.png', fullPage: true });
  
  await browser.close();
  console.log("Screenshots captured successfully!");
})();
