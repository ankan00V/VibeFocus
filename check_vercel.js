const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
        page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure().errorText));

        await page.goto('https://vibe-focus-three.vercel.app', { waitUntil: 'networkidle0' });
        await browser.close();
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
    }
})();
