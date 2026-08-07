const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        let hasErrors = false;
        page.on('console', msg => {
            console.log('PAGE LOG:', msg.text());
            if (msg.type() === 'error') {
                hasErrors = true;
            }
        });
        page.on('pageerror', err => {
            console.log('PAGE ERROR:', err.toString());
            hasErrors = true;
        });

        await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'networkidle0' });

        const result = await page.evaluate(async () => {
            // Ensure tree container is active/initialized
            if (typeof initTree3D === 'function') {
                initTree3D();
            }
            
            const checks = {};
            checks.isTreeInitialized = typeof isTreeInitialized !== 'undefined' ? isTreeInitialized : false;
            checks.flowerPoolLength = typeof flowerPool !== 'undefined' ? flowerPool.length : 0;
            
            if (flowerPool && flowerPool.length > 0) {
                const f0 = flowerPool[0];
                checks.hasMesh = !!f0.mesh;
                checks.hasMat = !!f0.material;
                checks.uBloom = f0.material.uniforms.uBloom ? f0.material.uniforms.uBloom.value : null;
                checks.uPetalColor = f0.material.uniforms.uPetalColor ? f0.material.uniforms.uPetalColor.value : null;
                checks.uColor = f0.material.uniforms.uColor ? f0.material.uniforms.uColor.value : null;
                checks.uCenterColor = f0.material.uniforms.uCenterColor ? f0.material.uniforms.uCenterColor.value : null;
                checks.uPetalCount = f0.material.uniforms.uPetalCount ? f0.material.uniforms.uPetalCount.value : null;
                checks.uPetals = f0.material.uniforms.uPetals ? f0.material.uniforms.uPetals.value : null;
                checks.uSeed = f0.material.uniforms.uSeed ? f0.material.uniforms.uSeed.value : null;
                checks.transparent = f0.material.transparent;
                checks.depthWrite = f0.material.depthWrite;
            }

            // Test renderTree3D at 50% progress
            if (typeof renderTree3D === 'function') {
                renderTree3D(0.5, 60);
            }
            
            const visibleCountHalf = flowerPool.filter(f => f.mesh.visible).length;
            checks.visibleAt50Percent = visibleCountHalf;

            // Render several frames to advance bloom animation
            for (let f = 0; f < 60; f++) {
                renderTree3D(1.0, 60);
                await new Promise(r => setTimeout(r, 50));
            }

            const visibleCountFull = flowerPool.filter(f => f.mesh.visible).length;
            const fullyBloomedCount = flowerPool.filter(f => f.material.uniforms.uBloom.value >= 0.99).length;
            checks.visibleAt100Percent = visibleCountFull;
            checks.fullyBloomedAt100Percent = fullyBloomedCount;

            // Test resetTree3D
            if (typeof resetTree3D === 'function') {
                resetTree3D();
            }

            const visibleCountReset = flowerPool.filter(f => f.mesh.visible).length;
            const bloomValReset = flowerPool.filter(f => f.material.uniforms.uBloom.value === 0.0).length;
            checks.visibleAfterReset = visibleCountReset;
            checks.zeroBloomAfterReset = bloomValReset;

            return checks;
        });

        console.log('TEST RESULTS:', JSON.stringify(result, null, 2));
        await browser.close();

        if (hasErrors) {
            console.error("Test failed due to console/page errors.");
            process.exit(1);
        } else {
            console.log("All tests passed successfully!");
        }
    } catch (e) {
        console.error("Puppeteer Verification Script Error:", e);
        process.exit(1);
    }
})();
