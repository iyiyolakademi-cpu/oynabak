import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [width,height,count,expectedColumns] of [
  [320,720,3,2],[320,720,35,2],[390,844,100,2],[600,900,200,3]
 ]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true});
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.OynaBakMobileTables&&window.OynaBakFloorStudio,
    {timeout:20000});
   await page.evaluate(n=>{
    const prior=document.getElementById('ob-adisyon');prior?.remove();
    const section=document.createElement('section');section.id='ob-adisyon';
    const state={count:n,tickets:[{id:'t1',table_no:1,status:'open'},
      {id:'t4',table_no:4,status:'open'}],
      items:[{ticket_id:'t1',status:'ready'}],
      calls:[{table_no:2}],requests:[{table_no:3}],lastError:''};
    section.innerHTML='<div class="ob-shell"><header class="ob-head"><h2>İşletme</h2></header>'+
      '<div class="ob-tabs"><button class="ob-btn">Siparişler</button>'+
      '<button class="ob-btn active">Masalar</button>'+
      '<button class="ob-btn">Mutfak</button></div>'+
      window.OynaBakMobileTables.render({state,total:()=>42,money:x=>x+' TL'})+
      '</div>';
    document.body.appendChild(section);
   },count);
   const info=await page.evaluate(()=>{
    const root=document.getElementById('ob-adisyon'),
     grid=root.querySelector('.ob-mobile-table-grid'),
     tabs=root.querySelector('.ob-tabs'),
     tiles=[...root.querySelectorAll('.ob-mobile-table')];
    const template=getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
    const rect=tiles[0].getBoundingClientRect(),bar=tabs.getBoundingClientRect();
    return {tileCount:tiles.length,columns:template.length,rootWidth:root.clientWidth,
     contentWidth:root.scrollWidth,visible:getComputedStyle(grid).display!=='none',
     tileBounds:[rect.left,rect.right],navBottom:bar.bottom,viewport:innerWidth,
     statuses:['ready','call','order','occupied'].map(s=>
      root.querySelector('.ob-mobile-table--'+s)!=null)};
   });
   assert.equal(info.tileCount,count,'Wrong number of phone table tiles');
   assert.equal(info.columns,expectedColumns,'Incorrect mobile table grid columns');
   assert.ok(info.visible,'Mobile tables were hidden');
   assert.ok(info.contentWidth<=info.rootWidth+3,'Horizontal overflow on mobile');
   assert.ok(info.tileBounds[0]>=-1&&info.tileBounds[1]<=width+1,'First tile clips');
   assert.ok(info.navBottom<=height+2&&info.navBottom>=height-30,'Mobile tabs not at bottom');
   if(count>=4)assert.ok(info.statuses.every(Boolean),'Missing one of 4 priority states');
   assert.ok(await page.locator('.ob-mobile-table-search').isVisible(),'Phone table search invisible');
   assert.equal(await page.locator('.ob-mobile-filter').count(),4,'Phone filters missing');
   const search=page.locator('#ob-mobile-table-search');
   await search.fill('1');
   await page.evaluate(()=>{
    const root=document.querySelector('.ob-mobile-tables'),q=root.querySelector('input');
    window.OynaBakMobileTables.applyFilters(root,q.value,'all');
   });
   const visible=await page.locator('.ob-mobile-table:not([hidden])').count();
   const expected=Array.from({length:count},(_,i)=>String(i+1)).filter(x=>x.includes('1')).length;
   assert.equal(visible,expected,'Mobile table search filtering mismatch');
   await search.fill('999');
   await page.evaluate(()=>{
    const root=document.querySelector('.ob-mobile-tables'),q=root.querySelector('input');
    window.OynaBakMobileTables.applyFilters(root,q.value,'all');
   });
   assert.equal(await page.locator('.ob-mobile-table:not([hidden])').count(),0,
    'Mobile table search no-results mismatch');
   assert.equal(await page.locator('[data-ob-mobile-empty]').isVisible(),true);
   await search.fill('');
   await page.evaluate(()=>{
    const root=document.querySelector('.ob-mobile-tables');
    window.OynaBakMobileTables.applyFilters(root,'','urgent');
   });
   assert.equal(await page.locator('.ob-mobile-table:not([hidden])').count(),2,
    'Urgent only must show waiter call and QR order tables');
   await page.evaluate(()=>{
    const root=document.querySelector('.ob-mobile-tables');
    window.OynaBakMobileTables.applyFilters(root,'','occupied');
   });
   assert.equal(await page.locator('.ob-mobile-table:not([hidden])').count(),count>=4?2:1,
    'Occupied filter mismatch');
   console.log('Mobile check passed:',width+'x'+height,count,'tables with search and filters');
  }finally{await page.close()}
 }
 // Desktop remains a full, zoomable physical floor map.
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForFunction(()=>window.OynaBakFloorStudio&&window.OynaBakFloorGeometry,{timeout:20000});
  const info=await page.evaluate(()=>{
   const prior=document.getElementById('ob-adisyon');prior?.remove();
   const root=document.createElement('section');root.id='ob-adisyon';
   const geometry=window.OynaBakFloorGeometry.positions(100);
   const state={count:100,floorDraft:geometry,floorEditing:false,floorExpanded:false,
    floorZoom:1,floorSelected:1,canManage:true,floorAvailable:true,
    tickets:[],items:[],calls:[],requests:[]};
   root.innerHTML='<div class="ob-shell">'+window.OynaBakFloorStudio.render({
    state,total:()=>0,money:()=>'',floorStyle:p=>'left:'+p.x+'%;top:'+p.y+'%;'
   })+'</div>';
   document.body.appendChild(root);
   return {tiles:root.querySelectorAll('.ob-floor-table').length,
    scrollable:getComputedStyle(root.querySelector('.ob-floor-scroll')).overflowX,
    floorVisible:getComputedStyle(root.querySelector('.ob-floor')).display!=='none'};
  });
  assert.equal(info.tiles,100);
  assert.ok(info.floorVisible);
  assert.ok(['auto','scroll'].includes(info.scrollable));
  console.log('Desktop floor check passed: 100 tables');
 }finally{await page.close()}
}finally{await browser.close()}
