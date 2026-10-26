import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const files=[
 'adisyon/app.js','adisyon/customer-orders.js','adisyon/daily-overview.js',
 'adisyon/simple-console.js','adisyon/simple-admin.js','adisyon/staff-pin.js',
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
console.log('OynaBak static smoke tests passed.');
