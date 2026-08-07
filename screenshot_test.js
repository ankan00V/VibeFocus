const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('LOG:', msg.text()));
        page.on('pageerror', err => console.log('ERROR:', err.toString()));

        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('https://vibe-focus-three.vercel.app', { waitUntil: 'networkidle0' });
        
        console.log('Page loaded');
        
        // Take initial screenshot
        await page.screenshot({ path: 'screenshot_1.png' });
        
        // Wait and click Deep Woods vibe
        await page.evaluate(() => {
            const btn = document.querySelector('[data-vibe="tree"]');
            if(btn) btn.click();
        });
        
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: 'screenshot_2.png' });
        
        // Click start button
        await page.evaluate(() => {
            const btn = document.getElementById('btn-start');
            if(btn) btn.click();
        });
        
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: 'screenshot_3.png' });
        
        console.log("Done taking screenshots.");
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
