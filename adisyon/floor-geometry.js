/* Large venue floor geometry. Coordinates remain 0–100 so old saved plans and QR numbers are unchanged. */
(()=>{
'use strict';
function dimensions(count){
 const n=Math.max(1,Math.min(200,Math.trunc(Number(count)||1)));
 const columns=Math.min(n,16,Math.max(1,Math.ceil(Math.sqrt(n*1.7))));
 const rows=Math.ceil(n/columns);
 return {columns,rows,width:Math.max(1000,columns*133+88),height:Math.max(640,rows*132+72),count:n};
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