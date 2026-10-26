import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const files=[
 'adisyon/app.js','adisyon/customer-orders.js','adisyon/daily-overview.js',
 'adisyon/simple-console.js','adisyon/simple-admin.js','adisyon/staff-pin.js','games/okey.js',
 'finance/preview.js'
];
for(const file of files){
 assert.ok(existsSync(file), 'Missing file: '+file);
 new Script(readFileSync(file,'utf8'),{filename:file});
 console.log('OK syntax',file);
}
const html=readFileSync('index.html','utf8');
let count=0;
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 const code=match[1];
 if(!code.trim()||code.trim().startsWith('{"@context"'))continue;
 new Script(code,{filename:'index.inline.'+(++count)+'.js'});
}
console.log('OK inline scripts',count);
const app=readFileSync('adisyon/app.js','utf8');
const summary=readFileSync('adisyon/daily-overview.js','utf8');
assert.match(app,/hasAttribute\('data-ob-product'\)/,'first product button must work');
assert.match(app,/querySelectorAll\('\[data-ob-enable-alerts\]'\)/,'alarm button must not overwrite other controls');
assert.match(app,/data-ob-tool="move"/,'move tool visible');
assert.match(app,/data-ob-tool="split"/,'split tool visible');
assert.match(app,/data-ob-report-days="30"/,'reports accessible');
assert.match(html,/tables:Number\(d\.get\('tables'\)\)/,'table count must not reset');
assert.match(html,/ob-last-venue/,'QR remembered venue missing');
assert.match(html,/daily-overview\.js/,'overview module missing');
assert.match(html,/function customerTable\(\).*?return 0/,'unknown event table attribution missing');
assert.match(summary,/ob_ops_daily_summary/);
const oldNames=['adisyon/simple-console.js','adisyon/staff-pin.js'];
for(const name of oldNames)assert.ok(!html.includes('src="'+name+'"'),name+' legacy mode should not load');

const okeyPage=readFileSync('games/okey.html','utf8');
const okeyJs=readFileSync('games/okey.js','utf8');
const okeyCss=readFileSync('games/okey.css','utf8');
assert.match(html,/String\(venue\?\.id\)===['"]70abef21-053c-4026-b402-e18311f758d5['"]/,'Academy-only game card missing');
assert.match(html,/data-action="okey-open"/,'Okey launch button missing');
assert.match(html,/games\/okey\.html/,'Native Okey route missing');
assert.match(okeyPage,/id="newGame"/);
assert.match(okeyPage,/id="joinGame"/);
assert.match(okeyPage,/id="rack"/);
assert.match(okeyPage,/id="finishBtn"/);
assert.match(okeyJs,/ob_okey_open/);
assert.match(okeyJs,/ob_okey_state/);
assert.match(okeyJs,/ob_okey_act/);
assert.match(okeyJs,/p_venue_id:VENUE/);
assert.match(okeyCss,/\.table-surface/);
console.log('OK Okey pilot assets, academy gate, lobby and API links');

console.log('OynaBak static smoke tests passed.');
