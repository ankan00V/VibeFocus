const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('LOG:', msg.text()));
        page.on('pageerror', err => console.log('ERROR:', err.toString()));
        page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));

        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('https://vibe-focus-three.vercel.app', { waitUntil: 'networkidle0' });
        
        console.log('Page loaded');
        
        // Click hero start
        await page.evaluate(() => {
            const btn = document.getElementById('btn-hero-start');
            if(btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Wait and click Deep Woods vibe
        await page.evaluate(() => {
            const btn = document.querySelector('[data-vibe="tree"]');
            if(btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Click duration 25m
        await page.evaluate(() => {
            const btn = document.querySelector('[data-dur="25"]');
            if(btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 500));
        
        // Click start button
        await page.evaluate(() => {
            const btn = document.getElementById('btn-start');
            if(btn && !btn.disabled) btn.click();
            else console.log('START BTN DISABLED OR NOT FOUND');
        });
        
        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: 'screenshot_3.png' });
        
        console.log("Done taking screenshot 3");
        
        await new Promise(r => setTimeout(r, 10000));
        await page.screenshot({ path: 'screenshot_4.png' });

        console.log("Done taking screenshot 4");
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
