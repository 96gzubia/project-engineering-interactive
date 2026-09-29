const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true});
const context=await browser.newContext(); const page=await context.newPage();
const base=process.env.TEST_BASE||'http://localhost:8000/project-engineering-interactive/';
await page.goto(base); await page.waitForFunction(()=>document.querySelector('#current-lecture').textContent.includes('Lecture 01'));
await page.evaluate(()=>navigator.serviceWorker.ready); await page.reload();
await page.waitForFunction(()=>navigator.serviceWorker.controller);
for(const selector of ['#latest-lecture','#continue-lecture','.lecture-option']){
await page.click('#lecture-toggle'); await page.click(selector);
assert.ok(await page.locator('#lecture-frame').getAttribute('src').then(x=>x.includes('lectures/01-')));
}
await page.waitForFunction(async()=>{const c=await caches.open('project-engineering-v3');return !!await c.match('./lectures/01-direccion-de-proyectos.html')});
await page.goto(base+'aula_interactiva.html?example=1#slide-2'); await page.waitForURL('**/lectures/01-direccion-de-proyectos.html?example=1#slide-2');
assert.ok((await page.locator('body').innerText()).length>100);
await context.setOffline(true);
await page.goto(base); await page.waitForFunction(()=>document.querySelector('#current-lecture').textContent.includes('Lecture 01'));
await page.goto(base+'aula_interactiva.html?offline=1#slide-2'); await page.waitForURL('**/lectures/01-direccion-de-proyectos.html?offline=1#slide-2');
assert.ok((await page.locator('body').innerText()).length>100);
const nojs=await browser.newContext({javaScriptEnabled:false});const p=await nojs.newPage();
await p.goto(base+'aula_interactiva.html');await p.waitForURL('**/lectures/01-direccion-de-proyectos.html');
console.log('PASS: shell, menu, Latest, Continue, legacy query/fragment, offline shell and legacy lecture, no-JS redirect');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
