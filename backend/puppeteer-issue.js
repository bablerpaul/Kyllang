const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    console.log('Starting puppeteer test for Issuing Certificate...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    try {
        console.log('Navigating to login...');
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
        
        await page.type('input[type="text"]', 'testdoctor1@test.com');
        await page.type('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        console.log('Logged in as Doctor. Go to My Patients...');
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a, button'));
            const myPatientsLink = links.find(l => l.textContent.includes('My Patients') && l.tagName === 'A');
            if(myPatientsLink) myPatientsLink.click();
        });
        await new Promise(r => setTimeout(r, 3000));

        console.log('Clicking View Patient...');
        await page.evaluate(() => {
            const viewBtns = Array.from(document.querySelectorAll('a, button')).filter(b => b.textContent.includes('View Patient') || b.textContent.includes('View'));
            if(viewBtns.length > 0) viewBtns[0].click();
        });
        await new Promise(r => setTimeout(r, 4000));
        
        console.log('Clicking Issue Medical Certificate...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const issueBtn = buttons.find(b => b.textContent.includes('Issue Medical Certificate') || b.textContent.includes('Issue Certificate'));
            if(issueBtn) issueBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('Filling out form...');
        await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            if(inputs.length > 0) {
                const input = inputs[0];
                input.value = 'Severe Cold';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            const textareas = Array.from(document.querySelectorAll('textarea'));
            if(textareas.length > 0) {
                const textarea = textareas[0];
                textarea.value = 'STEP40E CURRENT KEY ZKP E2E DEMO';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        
        await page.screenshot({ path: 'issue_cert_step1.png' });
        
        console.log('Review and Issue...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const reviewBtn = btns.find(b => b.textContent.includes('Review'));
            if(reviewBtn) reviewBtn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
        
        await page.screenshot({ path: 'issue_cert_step2.png' });
        
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const confirmBtn = btns.reverse().find(b => b.textContent.includes('Issue Certificate'));
            if(confirmBtn) confirmBtn.click();
        });
        
        console.log('Waiting for issuance to complete...');
        await new Promise(r => setTimeout(r, 15000)); 
        await page.screenshot({ path: 'issue_cert_final.png' });
        console.log('Test complete.');
    } catch(e) {
        console.log('ERROR:', e.message);
    } finally {
        await browser.close();
    }
})();
