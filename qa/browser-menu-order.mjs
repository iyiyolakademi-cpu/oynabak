import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const server='http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [width,height] of [[320,720],[390,844],[600,900]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,
   isMobile:true,hasTouch:true});
  try{
   await page.goto(server,{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.menuPublicHtml&&window.OynaBakCustomerOrders,{
    timeout:20000});
   await page.evaluate(async ()=>{
    const venue={id:'11111111-1111-4111-8111-111111111111',name:'QR Menü Testi',
     menu:{categories:[{id:'drinks',name:'İçecekler',active:true,
      subcategories:[{id:'warm',name:'Sıcak İçecekler'}],
      items:[
       {id:'espresso',name:'Espresso',active:true,sold_out:false,price:110,
        subcategory_id:'warm',variants:[]},
       {id:'latte',name:'Latte',active:true,sold_out:false,price:0,
        subcategory_id:'warm',variants:[{id:'small',name:'Küçük',price:140},
         {id:'large',name:'Büyük',price:170}]},
       {id:'soldout',name:'Tükendi',active:true,sold_out:true,price:190,variants:[]}
      ]}]}
    };
    window.__qrOrderTestCalls=[];
    window.OynaBakCustomerBridge={context:()=>({
     db:{rpc:async(name,args)=>{
      window.__qrOrderTestCalls.push({name,args});
      if(name==='ob_customer_order_config')
       return {data:{enabled:true,table_count:35,require_table_code:false},error:null};
      if(name==='ob_customer_order_submit')return {
       data:{id:'order-test',token:'test-access',status:'pending',total:250,table_no:1},
       error:null
      };
      if(name==='ob_customer_order_status')
       return {data:{found:true,status:'pending'},error:null};
      return {data:null,error:null};
     }},
     venue
    })};
    const dialog=document.querySelector('#modal');
    dialog.classList.add('menu-full');
    dialog.showModal();
    dialog.querySelector('.dialog-body').innerHTML=window.menuPublicHtml(venue.menu);
    await window.OynaBakCustomerOrders.start();
   });
   const viewport=await page.evaluate(()=>{
    const screen=document.querySelector('.menu-screen'),
     add=screen.querySelector('[data-ob-menu-add="espresso"]'),
     sold=screen.querySelector('[data-ob-menu-add="soldout"]');
    const rect=add.getBoundingClientRect();
    const style=getComputedStyle(add);
    return {enabled:screen.classList.contains('menu-order-enabled'),
     addVisible:style.display!=='none'&&!add.closest('[hidden]'),
     firstAddY:rect.top,firstAddBottom:rect.bottom,
     right:rect.right,screenWidth:innerWidth,
     soldDisabled:sold===null,
     initialSheetHidden:document.querySelector('#ob-qr-order').hidden};
   });
   assert.ok(viewport.enabled,'QR menu ordering did not activate');
   assert.ok(viewport.addVisible,'Inline +Ekle hidden');
   assert.ok(viewport.firstAddY>=0&&viewport.firstAddBottom<height-55,
    'First +Ekle is below the first mobile screen');
   assert.ok(viewport.right<=width+2,'Inline +Ekle clips offscreen');
   assert.ok(viewport.soldDisabled,'Sold-out item must not be orderable');
   assert.ok(viewport.initialSheetHidden,'Cart sheet must start closed');
   const before=await page.locator('#modal .dialog-body').evaluate(el=>el.scrollTop);
   await page.locator('[data-ob-menu-add="espresso"]').click();
   const after=await page.locator('#modal .dialog-body').evaluate(el=>el.scrollTop);
   assert.equal(before,after,'Adding a product scrolled away from the menu');
   assert.equal(await page.locator('.menu-order-quantity:not([hidden])').count(),1);
   await page.locator('[data-ob-menu-variant="latte"]').selectOption('small');
   await page.locator('[data-ob-menu-add="latte"]').click();
   const cart=page.locator('[data-ob-cart-jump]');
   assert.equal(await cart.isVisible(),true,'Persistent basket hidden');
   const metrics=await cart.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {bottom:r.bottom,left:r.left,right:r.right,viewportWidth:innerWidth,viewportHeight:innerHeight};
   });
   assert.ok(metrics.bottom<=height+3&&metrics.bottom>height-100,
    'Basket is not fixed at the bottom');
   assert.ok(metrics.left>=-2&&metrics.right<=width+2,
    'Basket off the side of phone');
   await cart.click();
   assert.equal(await page.locator('#ob-qr-order').isVisible(),true,'Cart sheet did not open');
   const sum=await page.locator('.ob-checkout-total').innerText();
   assert.ok(sum.includes('250'),'Variant pricing not reflected in basket: '+sum);
   assert.equal(await page.locator('.ob-checkout-line').count(),2);
   await page.locator('[data-ob-submit]').click();
   await page.waitForFunction(()=>document.querySelector('#ob-cart-title')?.textContent==='Siparişiniz');
   const payload=await page.evaluate(()=>window.__qrOrderTestCalls.find(x=>x.name==='ob_customer_order_submit')?.args);
   assert.ok(payload,'Mocked submit not called');
   assert.equal(payload.p_items.length,2);
   assert.equal(payload.p_items[1].variant_id,'small');
   assert.equal(payload.p_table_no,1);
   assert.ok(payload.p_request_key,'Idempotency key required');
   await page.locator('[data-ob-cart-close]').click();
   assert.equal(await page.locator('#ob-qr-order').isVisible(),false);
   console.log('QR inline ordering acceptance passed:',width+'x'+height);
  }finally{await page.close()}
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 try{
  await page.goto(server,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.menuPublicHtml&&window.OynaBakCustomerOrders);
  const disabled=await page.evaluate(async ()=>{
   const v={id:'22222222-2222-4222-8222-222222222222',
    menu:{categories:[{id:'x',name:'Test',active:true,
      items:[{id:'a',name:'Su',active:true,price:20}]}]}};
   window.OynaBakCustomerBridge={context:()=>({
    db:{rpc:async()=>({data:{enabled:false},error:null})},venue:v
   })};
   const d=document.querySelector('#modal');d.classList.add('menu-full');d.showModal();
   d.querySelector('.dialog-body').innerHTML=window.menuPublicHtml(v.menu);
   await window.OynaBakCustomerOrders.start();
   return {orderEnabled:Boolean(d.querySelector('.menu-order-enabled')),
    controlHidden:Boolean(d.querySelector('.menu-order-controls')?.hidden)};
  });
  assert.equal(disabled.orderEnabled,false,'Disabled order module should not activate');
  assert.equal(disabled.controlHidden,true,'Disabled order must not display +Ekle');
  console.log('Menu-only disabled ordering fallback passed.');
 }finally{await page.close()}
}finally{await browser.close()}
