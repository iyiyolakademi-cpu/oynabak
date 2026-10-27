/* Large venue floor geometry. Coordinates remain 0–100 so old saved plans and QR numbers are unchanged. */
(()=>{
'use strict';
function dimensions(count,savedPositions){
 const n=Math.max(1,Math.min(200,Math.trunc(Number(count)||1)));
 const columns=Math.min(n,16,Math.max(1,Math.ceil(Math.sqrt(n*1.7))));
 const rows=Math.ceil(n/columns);
 let width=Math.max(1000,columns*133+88),height=Math.max(640,rows*132+72);
 // Saved 5-column/long-room layouts must keep their original coordinates.
 // Enlarge the canvas, not the stored coordinates or QR/table numbering.
 if(Array.isArray(savedPositions)&&savedPositions.length===n){
  const tile=112,needed=116,limit=12000,points=savedPositions;
  for(let pass=0;pass<3;pass++){
   let changed=false;
   for(let i=0;i<n;i++){
    const a=points[i];if(!a)continue;
    for(let j=i+1;j<n;j++){
     const b=points[j];if(!b)continue;
     const dx=Math.abs(Number(a.x)-Number(b.x)),dy=Math.abs(Number(a.y)-Number(b.y));
     if(!Number.isFinite(dx)||!Number.isFinite(dy))continue;
     if(dx*(width-tile)/100>=needed||dy*(height-tile)/100>=needed)continue;
     const xTarget=dx>0?Math.ceil(tile+needed*100/dx):Infinity;
     const yTarget=dy>0?Math.ceil(tile+needed*100/dy):Infinity;
     if(xTarget<=limit&&(xTarget/width<yTarget/height||yTarget>limit)){
      if(xTarget>width){width=xTarget;changed=true}
     }else if(yTarget<=limit&&yTarget>height){
      height=yTarget;changed=true;
     }
    }
   }
   if(!changed)break;
  }
 }
 return {columns,rows,width,height,count:n};
}
function positions(count){
 const d=dimensions(count),out=[];
 for(let i=0;i<d.count;i++){
  const col=i%d.columns,row=Math.floor(i/d.columns);
  out.push({
   table:i+1,shape:'square',
   x:Number((d.columns===1?50:5+90*col/(d.columns-1)).toFixed(1)),
   y:Number((d.rows===1?45:6+88*row/(d.rows-1)).toFixed(1))
  });
 }
 return out;
}
function clampZoom(value){return Math.max(0.1,Math.min(1.6,Math.round(Number(value)*100)/100||1));}
window.OynaBakFloorGeometry=Object.freeze({dimensions,positions,clampZoom});
})();