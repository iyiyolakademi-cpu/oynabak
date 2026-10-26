import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const codeFiles=[
 'adisyon/app.js','adisyon/customer-orders.js','adisyon/daily-overview.js',
 'adisyon/simple-console.js','adisyon/simple-admin.js','adisyon/staff-pin.js',
 'games/okey.js','games/okey-touch.js','games/pisti.js',
 'finance/preview.js'
];
for(const file of codeFiles){
 assert.ok(existsSync(file), 'Missing file: '+file);
 new Script(readFileSync(file,'utf8'),{filename:file});
 console.log('Syntax OK:',file);
}
const read=path=>readFileSync(path,'utf8');
const main=read('index.html');
let scripts=0;
for(const m of main.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(!m[1].trim()||m[1].trimStart().startsWith('{"@context"'))continue;
 new Script(m[1],{filename:'index.inline.'+(++scripts)});
}
const check=(hay,needle,message)=>assert.ok(hay.includes(needle),message);
check(main,'tables:Number(d.get(\'tables\'))','Venue table count regression');
check(main,'ob-last-venue','Remembered venue missing');
check(main,'daily-overview.js','Merchant summary module missing');
const adisyon=read('adisyon/app.js');
check(adisyon,"hasAttribute('data-ob-product')",'First product click broken');
check(adisyon,"querySelectorAll('[data-ob-enable-alerts]')",'Alarm controls broken');
check(adisyon,'data-ob-tool="move"','Table movement missing');
check(adisyon,'data-ob-tool="split"','Split receipt missing');
check(adisyon,'data-ob-report-days="30"','Reporting missing');
const okeyHtml=read('games/okey.html'),okey=read('games/okey.js');
const touch=read('games/okey-touch.js'),landscape=read('games/okey-landscape.css');
for(const [source,needle] of [[main,'data-action="okey-open"'],[main,'games/okey.html'],
 [okeyHtml,'id="playerName"'],[okeyHtml,'id="fullscreenBtn"'],
 [okey,'ob_okey_open'],[okey,'ob_okey_act'],[okey,'requestFullscreen'],
 [touch,'setPointerCapture'],[touch,'onReorder'],[touch,'onDraw'],[touch,'onThrow'],
 [landscape,'rotate(90deg)'],[landscape,'repeat(15']]){
 check(source,needle,'Okey regression: '+needle);
}
const pistiHtml=read('games/pisti.html'),pisti=read('games/pisti.js'),css=read('games/pisti.css');
for(const [source,needle] of [[main,'data-action="pisti-open"'],[main,'games/pisti.html'],
 [main,"kind:'pisti'"],[pistiHtml,'id="createForm"'],[pistiHtml,'id="joinForm"'],
 [pistiHtml,'id="hand"'],[pistiHtml,'id="resultModal"'],[pisti,'ob_pisti_open'],
 [pisti,'ob_pisti_state'],[pisti,'ob_pisti_act'],[pisti,'setPointerCapture'],
 [pisti,'p_venue_id:VENUE'],[css,'.felt'],[css,'@media(max-width:550px)']]){
 check(source,needle,'Pişti regression: '+needle);
}
console.log('All code and UI smoke checks passed. Inline scripts:',scripts);
