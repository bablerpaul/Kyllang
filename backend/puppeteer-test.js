const puppeteer = require('puppeteer');
(async () => {
    console.log('Starting puppeteer test...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    page.on('dialog', async dialog => {
        const msg = dialog.message();
        console.log('[DIALOG]', msg);
        if (msg.includes('passphrase to unlock')) {
            await dialog.accept('TestPassphrase1234');
        } else {
            await dialog.accept();
        }
    });
    try {
        console.log('Navigating to login...');
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
        await page.type('input[type="text"]', 'testpatient1@test.com');
        await page.type('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log('Logged in. Go to My Certificates...');
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const certLink = links.find(l => l.textContent.includes('My Certificates'));
            if(certLink) certLink.click();
        });
        await new Promise(r => setTimeout(r, 2000));
        console.log('Clicking View QR & Details...');
        await page.evaluate(() => {
            const viewBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('View QR'));
            if(viewBtns.length > 0) viewBtns[0].click();
        });
        await new Promise(r => setTimeout(r, 2000));
        console.log('Clicking Import ZK Credential...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const importBtn = btns.find(b => b.textContent.includes('Import ZK Credential'));
            if(importBtn) importBtn.click();
        });
        await new Promise(r => setTimeout(r, 4000));
        console.log('Test complete.');
    } catch(e) {
        console.log('ERROR:', e.message);
    } finally {
        await browser.close();
    }
})();
