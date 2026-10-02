import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.__simulation.sound.context),null);
 const rms=()=>page.evaluate(()=>{const a=window.__simulation.sound.analyser,data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);});
 const peakRms=async()=>{let peak=0;for(let i=0;i<35;i++){peak=Math.max(peak,await rms());await page.waitForTimeout(10);}return peak;};
 // The cockroach walks at sprint pace by default, so cautious walking (C) is the quiet baseline.
 await page.keyboard.down('c');await page.keyboard.down('w');await page.waitForTimeout(800);const walk=await peakRms();await page.keyboard.up('c');
 await page.keyboard.down('Shift');await page.waitForTimeout(800);const run=await peakRms();
 await page.keyboard.up('w');await page.keyboard.up('Shift');await page.keyboard.press('f');await page.waitForTimeout(1200);const wings=await rms();
 assert.ok(walk>1e-5,'walking produces output');assert.ok(run>1e-5,'running produces output');assert.ok(wings>walk,'wing flutter is audible over quiet walking');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(400);const blurred=await rms();assert.ok(blurred<1e-5);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.keyboard.press('f');await page.waitForTimeout(2500);await page.getByRole('tab',{name:'Wasp'}).click();await page.keyboard.press('f');await page.waitForTimeout(1200);let buzz=0;for(let i=0;i<25;i++){buzz+=await rms()/25;await page.waitForTimeout(20);}await page.keyboard.press('f');
 assert.ok(buzz>walk,'wasp buzz is audible over quiet walking');assert.ok(await page.evaluate(()=>!!window.__simulation.sound.hornet),'hornet recording loaded');assert.equal(await page.evaluate(()=>window.__simulation.sound.species),'wasp');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({walk,run,wings,buzz,blurred,errors}));
}finally{await browser.close();}
