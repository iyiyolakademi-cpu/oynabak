/* OynaBak Okey touchscreen gestures, isolated from server game rules. */
(() => {
'use strict';
function install(options){
 const rack=options.rack,draw=options.draw,discard=options.discard,throwButton=options.throwButton;
 let gesture=null,ghost=null,hover=null;
 const suppressed=new Map();
 const within=(rect,x,y,margin=0)=>x>=rect.left-margin&&x<=rect.right+margin&&y>=rect.top-margin&&y<=rect.bottom+margin;
 const tiles=()=>Array.from(rack.querySelectorAll('button[data-tile]'));
 const getTile=(element)=>element?.closest?.('button[data-tile]');
 const targetAt=(x,y)=>document.elementFromPoint(x,y);
 function closestIndex(x,y){
  const current=tiles();
  if(!current.length)return 0;
  let index=0,best=Infinity;
  current.forEach((el,i)=>{
    const r=el.getBoundingClientRect();
    const dist=Math.hypot((r.left+r.width/2-x),(r.top+r.height/2-y)*1.45);
    if(dist<best){best=dist;index=i}
  });
  return index;
 }
 function clearHover(){
  rack.classList.remove('drag-over');throwButton?.classList.remove('drop-active');
  hover?.classList.remove('drop-target');hover=null;
 }
 function clearGesture(){
  clearHover();ghost?.remove();ghost=null;
  if(gesture?.source)gesture.source.classList.remove('drag-origin');
  gesture=null;
 }
 function ensureGhost(ev){
  if(ghost||!gesture)return;
  ghost=gesture.source.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.removeAttribute('aria-label');
  ghost.className=(gesture.mode==='tile'?'tile ':'tile ')+(gesture.mode==='tile'?'':'joker ')+'ghost-tile';
  if(gesture.mode==='pile'){
   ghost.textContent='▧';
   ghost.classList.remove('joker');
  }
  const r=gesture.source.getBoundingClientRect();
  ghost.style.width=Math.min(64,Math.max(36,r.width))+'px';
  ghost.style.height=Math.min(78,Math.max(50,r.height))+'px';
  ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
  ghost.setAttribute('aria-hidden','true');
  document.body.appendChild(ghost);
  gesture.source.classList.add('drag-origin');
 }
 function paintHover(x,y){
  clearHover();
  const point=targetAt(x,y),rect=rack.getBoundingClientRect();
  if(within(rect,x,y,9)){
   rack.classList.add('drag-over');
   const tile=getTile(point);
   if(tile&&rack.contains(tile)){hover=tile;hover.classList.add('drop-target')}
  }
  if(gesture?.mode==='tile'&&throwButton&&options.canThrow(gesture.id)&&within(throwButton.getBoundingClientRect(),x,y,10)){
   throwButton.classList.add('drop-active');
  }
 }
 function start(e,mode,source,id=null){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(gesture)return;
  if(mode==='tile'&&!options.isRackReady())return;
  if(mode==='draw'&&!options.canDraw(source===draw?'draw':'take'))return;
  gesture={pointerId:e.pointerId,source,mode,id,startX:e.clientX,startY:e.clientY,dragged:false};
  try{source.setPointerCapture(e.pointerId)}catch(_){}
  if(mode==='tile')e.preventDefault();
 }
 function move(e){
  if(!gesture||gesture.pointerId!==e.pointerId)return;
  const distance=Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY);
  if(distance>=9)gesture.dragged=true;
  if(!gesture.dragged)return;
  e.preventDefault();ensureGhost(e);
  if(ghost){ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px'}
  paintHover(e.clientX,e.clientY);
 }
 function end(e){
  if(!gesture||e.pointerId!==gesture.pointerId)return;
  const g=gesture,dragged=g.dragged;
  let action=null,targetIndex=null;
  if(dragged){
   e.preventDefault();
   suppressed.set(g.source,Date.now()+650);
   const overRack=within(rack.getBoundingClientRect(),e.clientX,e.clientY,12);
   const overDiscard=throwButton&&g.mode==='tile'&&options.canThrow(g.id)&&within(throwButton.getBoundingClientRect(),e.clientX,e.clientY,13);
   if(g.mode==='tile'&&overDiscard&&options.canThrow(g.id))action='throw';
   else if(overRack){targetIndex=closestIndex(e.clientX,e.clientY);action=g.mode==='tile'?'reorder':'draw'}
  }else if(g.mode==='tile')action='select';
  try{if(g.source.hasPointerCapture(e.pointerId))g.source.releasePointerCapture(e.pointerId)}catch(_){}
  clearGesture();
  if(action==='select')options.onSelect(g.id);
  else if(action==='throw')options.onThrow(g.id);
  else if(action==='reorder')options.onReorder(g.id,targetIndex);
  else if(action==='draw')options.onDraw(g.source===draw?'draw':'take',targetIndex);
 }
 function cancel(e){if(gesture?.pointerId===e.pointerId)clearGesture()}
 function bindPointer(element,mode){
  element.addEventListener('pointerdown',e=>{
   const source=mode==='tile'?getTile(e.target):element;
   if(!source||(mode==='tile'&&!rack.contains(source)))return;
   start(e,mode,source,mode==='tile'?Number(source.dataset.tile):null);
  });
  element.addEventListener('pointermove',move);
  element.addEventListener('pointerup',end);
  element.addEventListener('pointercancel',cancel);
  element.addEventListener('lostpointercapture',e=>{
   if(gesture?.pointerId===e.pointerId)clearGesture();
  });
 }
 bindPointer(rack,'tile');bindPointer(draw,'draw');bindPointer(discard,'draw');
 rack.addEventListener('click',e=>{
  const tile=getTile(e.target);
  if(tile&&e.detail===0)options.onSelect(Number(tile.dataset.tile));
 });
 const ignoreClick=source=>{
  const expires=suppressed.get(source)||0;
  if(expires>Date.now()){suppressed.delete(source);return true}
  if(expires)suppressed.delete(source);
  return false;
 };
 return Object.freeze({ignoreClick});
}
window.OynaBakOkeyTouch=Object.freeze({install});
})();
