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

/* Live control center regressions: loads before the operations module and reuses
   existing permission-controlled server-side actions, not client-side mutations. */
const liveControl=read('adisyon/live-control.js');
const liveCss=read('adisyon/live-control.css');
new Script(liveControl,{filename:'adisyon/live-control.js'});
check(main,'adisyon/live-control.js','Live control center script missing');
check(main,'adisyon/live-control.css','Live control center style missing');
assert.ok(main.indexOf('adisyon/live-control.js')<main.indexOf('adisyon/app.js'),'Live control center script must load first');
for(const [source,needle] of [
 [adisyon,"tab('overview','◉ Canlı Kontrol')"],
 [adisyon,'window.OynaBakLiveControl?.render'],
 [adisyon,"['overview','tables'].includes(snapshot.tab)"],
 [adisyon,'data-ob-refresh'],
 [adisyon,'ob_ops_waiter_done'],
 [adisyon,'ob_customer_order_decide'],
 [adisyon,'ob_adisyon_item_status'],
 [liveControl,'data-ob-request-approve'],
 [liveControl,'data-ob-waiter-done'],
 [liveControl,'data-ob-status'],
 [liveControl,'floorBoard()'],
 [liveCss,'@media(max-width:470px)']
])check(source,needle,'Live controls regression: '+needle);


/* Scalable floor plan regressions for 1–200 tables.
   The same 0–100 coordinates continue working with the SQL floor-plan RPC. */
const floorFiles=['adisyon/floor-geometry.js','adisyon/floor-studio.js'];
const floorWindow={};
for(const file of floorFiles){
 const content=read(file);
 new Script(content,{filename:file}).runInNewContext({window:floorWindow});
 check(main,file,'Floor plan module missing: '+file);
}
check(main,'adisyon/floor-studio.css','Expanded floor stylesheet missing');
assert.ok(main.indexOf('adisyon/floor-geometry.js')<main.indexOf('adisyon/floor-studio.js'));
assert.ok(main.indexOf('adisyon/floor-studio.js')<main.indexOf('adisyon/app.js'));
const geometry=floorWindow.OynaBakFloorGeometry,studio=floorWindow.OynaBakFloorStudio;
assert.ok(geometry&&studio,'Floor studio did not initialize');
for(const count of [1,3,10,35,50,100,200]){
 const dims=geometry.dimensions(count),positions=geometry.positions(count);
 assert.equal(positions.length,count);
 assert.equal(new Set(positions.map(p=>p.table)).size,count);
 assert.equal(dims.rows,Math.ceil(count/dims.columns));
 assert.ok(dims.columns<=16&&dims.rows>=1);
 for(const p of positions)assert.ok(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100);
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
  const a=positions[i],b=positions[j],tile=112;
  const xgap=Math.abs((dims.width-tile)*(a.x-b.x)/100);
  const ygap=Math.abs((dims.height-tile)*(a.y-b.y)/100);
  assert.ok(xgap>=tile-1||ygap>=tile-1,'Overlapping tables '+count+': '+a.table+'/'+b.table);
 }
 const state={count,floorDraft:positions,floorEditing:true,floorZoom:1,
  floorExpanded:true,floorSelected:count,canManage:true,floorAvailable:true,
  tickets:[],items:[],requests:[],calls:[]};
 const html=studio.render({state,money:()=>'',total:()=>0,
  floorStyle:p=>'left:'+p.x+'%;top:'+p.y+'%;',active:()=>null});
 assert.equal((html.match(/class="ob-floor-table/g)||[]).length,count);
 for(const term of ['data-ob-floor-viewport','data-ob-floor-expand','data-ob-floor-zoom',
  'data-ob-floor-jump','data-ob-floor-confirm','data-ob-floor-drag="'+count+'"']){
  check(html,term,'Missing floor action '+term+' for '+count+' tables');
 }
}
assert.ok(geometry.clampZoom(.12)<.5&&geometry.clampZoom(2)===1.6);
for(const term of ['state.floorZoom','state.floorExpanded','focusFloorTable()',
 'changeFloorZoom(','state.floorScroll','ob_adisyon_floor_save',
 "['overview','tables'].includes(snapshot.tab)"]){
 check(adisyon,term,'Floor plan integration regression: '+term);
}
console.log('Floor studio tests passed: 1, 3, 10, 35, 50, 100 and 200 tables.');

console.log('All code and UI smoke checks passed. Inline scripts:',scripts);
