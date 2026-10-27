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
/* The previous 5-column saved arrangement needs extra vertical canvas space.
   Widen the viewport instead of silently rewriting saved table coordinates. */
const oldCount=35,oldColumns=5,oldRows=Math.ceil(oldCount/oldColumns);
const oldPositions=Array.from({length:oldCount},(_,i)=>({
 table:i+1,shape:'square',
 x:oldColumns===1?50:4+92*(i%oldColumns)/(oldColumns-1),
 y:oldRows===1?38:6+88*Math.floor(i/oldColumns)/(oldRows-1)
}));
const unchanged=JSON.stringify(oldPositions);
const legacyDims=geometry.dimensions(oldCount,oldPositions);
assert.ok(legacyDims.height>geometry.dimensions(oldCount).height,'Legacy plan must gain vertical space');
assert.equal(JSON.stringify(oldPositions),unchanged,'Previously saved coordinates must not be rewritten');
for(let i=0;i<oldCount;i++)for(let j=i+1;j<oldCount;j++){
 const a=oldPositions[i],b=oldPositions[j],tile=112;
 const dx=Math.abs((legacyDims.width-tile)*(a.x-b.x)/100);
 const dy=Math.abs((legacyDims.height-tile)*(a.y-b.y)/100);
 assert.ok(dx>=tile||dy>=tile,'Legacy plan overlap: '+a.table+'/'+b.table);
}
const legacyRender=studio.render({state:{
 count:oldCount,floorDraft:oldPositions,floorEditing:false,floorZoom:1,
 floorExpanded:false,floorSelected:1,canManage:true,floorAvailable:true,
 tickets:[],items:[],requests:[],calls:[]
},money:()=>'',total:()=>0,floorStyle:p=>'left:'+p.x+'%;top:'+p.y+'%;'});
check(legacyRender,'height:'+legacyDims.height+'px','Legacy viewport height was not kept');
assert.ok(geometry.clampZoom(.12)<.5&&geometry.clampZoom(2)===1.6);
for(const term of ['state.floorZoom','state.floorExpanded','focusFloorTable()',
 'changeFloorZoom(','state.floorScroll','ob_adisyon_floor_save',
 "['overview','tables'].includes(snapshot.tab)"]){
 check(adisyon,term,'Floor plan integration regression: '+term);
}
console.log('Floor studio tests passed: 1, 3, 10, 35, 50, 100 and 200 tables.');

console.log('All code and UI smoke checks passed. Inline scripts:',scripts);

/* 27 Oct 2026: final public sales release guards. */
const webHtml=read('index.html');
const customerOrderCode=read('adisyon/customer-orders.js');
for(const needle of [
 'const LEGAL_VERSION=\'27.10.2026\'',
 'QR sipariş ve adisyon modüllerini kapsar',
 'Adisyon, mutfak/bar ve ön muhasebe temel 4.000 TL paketine dahil değildir',
 'Garson çağrısı, sipariş ve adisyon pakete dahil mi?'
])check(webHtml,needle,'Sales/legal claim regression: '+needle);
check(customerOrderCode,'ob-order-privacy-note','QR order privacy notice missing');
for(const [file,needle] of [
 ['adisyon/2026-10-27-final-waiter-safety.sql','pg_advisory_xact_lock'],
 ['adisyon/2026-10-27-final-waiter-safety.sql','LIMIT 500'],
 ['adisyon/2026-10-27-final-telemetry-safety.sql','venue.active AND venue.licensed'],
 ['games/2026-10-27-okey-single-discard-fix.sql','min(d.ord)']
])check(read(file),needle,'Final security migration regression: '+file+' / '+needle);
console.log('Sales launch regression checks passed.');


/* 27 Oct 2026 — Phone-first operations acceptance and secure mobile tiles. */
const mobileCode=read('adisyon/mobile-tables.js'),mobileStyles=read('adisyon/mobile-operations.css');
const mobileWindow={};
new Script(mobileCode,{filename:'adisyon/mobile-tables.js'}).runInNewContext({window:mobileWindow});
assert.ok(mobileWindow.OynaBakMobileTables?.render,'Mobile table UI missing');
check(main,'adisyon/mobile-tables.js','Mobile table script not loaded');
check(main,'adisyon/mobile-operations.css','Mobile operations CSS not loaded');
assert.ok(main.indexOf('adisyon/mobile-tables.js')<main.indexOf('adisyon/app.js'),
 'Mobile tiles script must load before the adisyon app');
for(const term of ["const defaultTab=phone?'tables'","mobileTableView:'grid'",
 'data-ob-mobile-view="grid"','data-ob-mobile-view="plan"',
 "data-ob-mobile-view]","window.OynaBakMobileTables?.render"]){
 check(adisyon,term,'Mobile phone-first integration regression: '+term);
}
for(const term of ['@media(max-width:700px)','position:fixed!important',
 '.ob-mobile-table-grid','.ob-mobile-table--call','.ob-mobile-table--order',
 'env(safe-area-inset-bottom)']){
 check(mobileStyles,term,'Mobile layout regression: '+term);
}
for(const count of [1,3,10,35,100,200]){
 const state={count,tickets:[],items:[],calls:[],requests:[],lastError:''};
 const html=mobileWindow.OynaBakMobileTables.render({state,total:()=>0,money:n=>String(n)+' TL'});
 assert.equal((html.match(/data-ob-table="/g)||[]).length,count,'Table tiles count: '+count);
 assert.ok(html.includes('data-ob-table="'+count+'"'),'Missing last mobile table: '+count);
}
const sampleHtml=mobileWindow.OynaBakMobileTables.render({
 state:{count:4,lastError:'<unsafe>',tickets:[{id:'t1',table_no:1,status:'open'}],
  items:[{ticket_id:'t1',status:'ready'}],calls:[{table_no:2}],requests:[{table_no:3}]},
 total:()=>57,money:n=>String(n)+' TL'
});
for(const term of ['ob-mobile-table--ready','ob-mobile-table--call',
 'ob-mobile-table--order','ob-mobile-table--empty','57 TL','&lt;unsafe&gt;']){
 check(sampleHtml,term,'Mobile table status/privacy regression: '+term);
}
check(adisyon,'Masalar hazırlanıyor…','Mobile loading state missing');
check(mobileStyles,'.ob-mobile-loading-grid','Mobile loading styles missing');
console.log('Mobile table-first UI smoke checks passed (1–200 tables, status, safe HTML).');

/* Sale readiness: live queue, audio parity and SQL-only guards. */
const simple=read('adisyon/simple-console.js');
const simpleCss=read('adisyon/simple-console.css');
for(const token of ["refreshQueued=true","refreshQueued=false","queueMicrotask(()=>refresh(true)",
 "updateAlarmButton();","ob-sync-error"]){
 check(adisyon,token,'Operations sync regression: '+token);
}
for(const token of ["window.OynaBakPlayWaiterTone(audioCtx)","tab='tables'",
 "⚠ Bağlantı kontrol ediliyor","document.addEventListener('visibilitychange'",
 "window.addEventListener('online'","window.addEventListener('offline'"]){
 check(simple,token,'Simple console alarm/connectivity regression: '+token);
}
for(const token of [".ob-simple-tabs{position:fixed",".ob-simple-tables{display:grid;",
 ".ob-simple-stale","env(safe-area-inset-bottom"]){
 check(simpleCss,token,'Simple mobile CSS regression: '+token);
}
const salesSafety=read('adisyon/2026-10-27-sales-readiness-security.sql');
for(const token of ["ob_adisyon_permission","venue.active","venue.licensed",
 "pg_advisory_xact_lock","ob_event_v3","ob_score"]){
 // Licence columns may appear as v.active / v.licensed in the actual function definition.
 assert.ok(salesSafety.includes(token)||salesSafety.includes(token.replace('venue.','v.')),
 'Sales security SQL missing '+token);
}
console.log('Sale readiness security and responsive operations checks passed.');
