import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';

const files=[
 'adisyon/app.js','adisyon/customer-orders.js','adisyon/daily-overview.js',
 'adisyon/simple-console.js','adisyon/simple-admin.js','adisyon/staff-pin.js','games/okey.js','games/okey-touch.js','games/pisti.js',
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
const okeyTouch=readFileSync('games/okey-touch.js','utf8');
const landscape=readFileSync('games/okey-landscape.css','utf8');
assert.match(okeyPage,/id="playerName"/,'Single name input required');
assert.match(okeyPage,/id="modeCreate"/,'Create mode choice required');
assert.match(okeyPage,/id="modeJoin"/,'Join mode choice required');
assert.match(okeyPage,/id="fullscreenBtn"/,'Fullscreen control required');
assert.match(okeyPage,/okey-touch\\.js/,'Touch controller script required');
assert.match(okeyPage,/okey-landscape\\.css/,'Landscape stylesheet required');
assert.match(okeyJs,/requestFullscreen/,'Fullscreen API must be requested on user gesture');
assert.match(okeyJs,/orientation\\?\\.lock/,'Orientation lock fallback required');
assert.match(okeyJs,/immersiveMode\\(true\\)/,'Game must enter immersive layout');
assert.match(okeyJs,/onDraw:\\(action,index\\)=>doMove/,'Drag-to-rack must call verified draw RPC');
assert.match(okeyJs,/onThrow:id=>doMove/,'Tile throw gesture must call server move');
assert.match(okeyTouch,/setPointerCapture/,'Pointer capture needed for touch drag outside rack');
assert.match(okeyTouch,/onReorder/,'Tile reorder must be wired');
assert.match(okeyTouch,/onDraw/,'Pile drag must be wired');
assert.match(okeyTouch,/onThrow/,'Discard gesture must be wired');
assert.match(okeyTouch,/ignoreClick/,'Native click suppression prevents duplicate draw');
assert.match(landscape,/orientation:portrait/,'iPhone portrait fallback required');
assert.match(landscape,/rotate\\(90deg\\)/,'Rotated landscape view required');
assert.match(landscape,/grid-template-columns:repeat\\(15/,'15-tile mobile rack required');
console.log('OK Okey mobile landscape, fullscreen request, room selection and touch drag checks');

console.log('OK Okey pilot assets, academy gate, lobby and API links');


const pistiPage=readFileSync('games/pisti.html','utf8');
const pistiJs=readFileSync('games/pisti.js','utf8');
const pistiCss=readFileSync('games/pisti.css','utf8');
assert.match(html,/data-action="pisti-open"/,'Pişti game launch missing');
assert.match(html,/games\\/pisti\\.html/,'Pişti route missing');
assert.match(html,/kind:'pisti'/,'Academy-only Pişti card missing');
assert.match(pistiPage,/id="createForm"/);
assert.match(pistiPage,/id="joinForm"/);
assert.match(pistiPage,/id="centerPile"/);
assert.match(pistiPage,/id="hand"/);
assert.match(pistiPage,/id="readyButton"/);
assert.match(pistiJs,/ob_pisti_open/);
assert.match(pistiJs,/ob_pisti_state/);
assert.match(pistiJs,/ob_pisti_act/);
assert.match(pistiJs,/setPointerCapture/,'Touch-to-play must support drag');
assert.match(pistiJs,/pointerup/);
assert.match(pistiJs,/p_venue_id:VENUE/,'Venue scope');
assert.match(pistiCss,/\\.felt/);
assert.match(pistiCss,/@media\\(max-width:550px\\)/,'Mobile portrait layout');
console.log('OK Pişti pilot security gate, UI, mobile touch, rounds and RPC links');

console.log('OynaBak static smoke tests passed.');
