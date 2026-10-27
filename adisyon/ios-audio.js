/* OynaBak POS alarm — native HTMLAudio fallback for iOS Safari/WebKit.
 * Recreates the EXACT 740/1110/1480 Hz two-strike POS melody used by
 * OynaBakPlayWaiterTone(). No network, account changes or third-party audio.
 * Browser restrictions still require an initial real user interaction.
 */
(function(){
 'use strict';
 const apple=/iPad|iPhone|iPod/i.test(navigator.userAgent||'') ||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let player=null,clipUrl='',mediaReady=false,mediaError='',resumePromise=null,enabledOnce=false;
 function setPlaybackCategory(){
  if(!apple)return;
  // iOS 17+ Safari supports the Audio Session API, and the playback category
  // permits UI sound even when the Ring/Silent switch uses the ambient category.
  try{
   if(navigator.audioSession&&navigator.audioSession.type!=='playback')
    navigator.audioSession.type='playback';
  }catch(err){console.warn('iOS ses oturumu ayarlanamadı:',err)}
 }
 function buildTone(){
  const rate=44100,duration=.72,n=Math.ceil(rate*duration),data=new ArrayBuffer(44+n*2),v=new DataView(data);
  function str(pos,s){for(let i=0;i<s.length;i++)v.setUint8(pos+i,s.charCodeAt(i))}
  str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
  const harmonics=[[740,.44,'triangle'],[1110,.22,'sine'],[1480,.08,'sine']];
  let peak=0;
  const values=new Float64Array(n);
  for(let i=0;i<n;i++){
   const t=i/rate;let sample=0;
   for(const [offset,dur] of [[0,.23],[.34,.27]]){
    const local=t-offset;
    if(local<0||local>=dur)continue;
    // Same piecewise exponential gain envelope as the WebAudio oscillator.
    let factor;
    if(local<.012)factor=Math.exp(Math.log(.0001)+(Math.log(1)-Math.log(.0001))*(local/.012));
    else if(local<.08)factor=Math.exp(Math.log(1)+(Math.log(.65))*(local-.012)/.068);
    else factor=Math.exp(Math.log(.65)+(Math.log(.0001/.65))*(local-.08)/(dur-.08));
    for(const [freq,volume,wave] of harmonics){
     const phase=2*Math.PI*freq*local;
     sample+=volume*factor*(wave==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):Math.sin(phase));
    }
   }
   values[i]=sample*.95;peak=Math.max(peak,Math.abs(values[i]));
  }
  // Avoid clipping; preserve the original relative pitch and two-hit rhythm.
  const scale=peak>0.96?.96/peak:1;
  for(let i=0;i<n;i++)v.setInt16(44+2*i,Math.max(-32767,Math.min(32767,Math.round(values[i]*scale*32767))),true);
  return URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
 }
 function prepare(){
  if(!apple)return null;
  if(!player){
   clipUrl=buildTone();
   player=new Audio();
   player.preload='auto';player.playsInline=true;player.setAttribute('playsinline','');
   player.src=clipUrl;player.volume=1;player.muted=false;
   // Some iOS WebKit builds reliably retain their playback route with a
   // persistent media element.
   player.style.display='none';
   (document.body||document.documentElement).appendChild(player);
  }
  return player;
 }
 function resume(ctx){
  setPlaybackCategory();
  if(!ctx||ctx.state==='running'||ctx.state==='closed')return Promise.resolve(ctx?.state==='running');
  try{
   const pending=ctx.resume();
   if(pending&&typeof pending.then==='function'){
    resumePromise=pending.catch(err=>{console.warn('WebAudio yeniden başlatma:',err);return false});
    return resumePromise;
   }
  }catch(err){console.warn('WebAudio yeniden başlatma:',err)}
  return Promise.resolve(ctx.state==='running');
 }
 function webTone(ctx){
  return Boolean(ctx&&ctx.state==='running'&&
   typeof window.OynaBakPlayWaiterTone==='function'&&window.OynaBakPlayWaiterTone(ctx));
 }
 function play(ctx){
  if(!apple)return webTone(ctx);
  setPlaybackCategory();
  const sound=prepare();
  if(!sound)return webTone(ctx);
  try{
   if(!sound.paused)sound.pause();
   sound.currentTime=0;
   sound.volume=1;sound.muted=false;
   const promise=sound.play();
   if(promise&&typeof promise.then==='function'){
    promise.then(()=>{mediaReady=true;mediaError='';},err=>{
     mediaReady=false;mediaError=String(err?.message||err);
     if(!webTone(ctx))console.warn('iOS POS sesi için ekrana dokunulmalı:',mediaError);
    });
   }else{mediaReady=true;mediaError=''}
   return true;
  }catch(err){
   mediaReady=false;mediaError=String(err?.message||err);
   return webTone(ctx);
  }
 }
 function ready(ctx){
  if(apple)return Boolean(mediaReady||ctx?.state==='running');
  return Boolean(ctx&&ctx.state==='running');
 }
 function enable(ctx){
  enabledOnce=true;
  setPlaybackCategory();
  // Both .play() and .resume() are invoked before the very first await,
  // during the actual click / touch activation stack on Safari.
  const task=apple?(function(){
   const sound=prepare();
   try{
    if(!sound)return Promise.resolve(false);
    if(!sound.paused)sound.pause();
    sound.currentTime=0;sound.volume=1;sound.muted=false;
    const p=sound.play();
    if(!p||typeof p.then!=='function'){mediaReady=true;return Promise.resolve(true)}
    return Promise.resolve(p).then(()=>{mediaReady=true;mediaError='';return true},err=>{
     mediaReady=false;mediaError=String(err?.message||err);return false;
    });
   }catch(err){mediaReady=false;mediaError=String(err?.message||err);return Promise.resolve(false)}
  })():Promise.resolve(false);
  const web=resume(ctx);
  // iOS WebKit occasionally never settles AudioContext.resume(). Avoid
  // leaving the enable button frozen forever waiting for that promise.
  return Promise.race([
   apple?task:Promise.resolve(web),
   new Promise(resolve=>setTimeout(()=>resolve(false),1800))
  ]).then(ok=>{
   if(apple&&!ok&&ctx?.state==='running')webTone(ctx);
   if(!apple&&ctx?.state==='running')webTone(ctx);
   return {ok:apple?(mediaReady||ctx?.state==='running'):ctx?.state==='running',
    channel:apple?(mediaReady?'html5':ctx?.state==='running'?'webaudio':'blocked'):'webaudio',
    error:mediaError};
  });
 }
 function unlockOnGesture(ctx){
  // No audible beep merely because the user touched an unrelated control.
  // Resuming the processing context is allowed; the notification will sound
  // only after an actual incoming order / explicit audio test.
  if(!enabledOnce)return;
  resume(ctx).catch(()=>{});
 }
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&enabledOnce)setPlaybackCategory();
 });
 window.OynaBakPOSAudio=Object.freeze({
  isApple:apple,enable,play,resume,ready,unlockOnGesture,
  status:()=>({apple,htmlAudioReady:mediaReady,error:mediaError,
   audioSession:(navigator.audioSession?.type||'unavailable')})
 });
})();
