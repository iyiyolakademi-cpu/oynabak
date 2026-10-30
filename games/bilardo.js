(()=>{
'use strict';
const VENUE=new URL(location.href).searchParams.get('isletme')||'';
const PROJECT='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const ROOM_KEY='ob-bilardo:room:'+VENUE, NAME_KEY='ob-bilardo:name';
const $=id=>document.getElementById(id);
const W=400,H=840,LEFT=42,RIGHT=358,TOP=81,BOTTOM=779,RADIUS=14.1;
const POCKET_CAPTURE_RADIUS=28,POCKET_GUIDE_RADIUS=38;
const pockets=[{x:40,y:81},{x:360,y:81},{x:40,y:430},{x:360,y:430},{x:40,y:779},{x:360,y:779}];
const colors={red:'#dd433c',blue:'#307cd2',black:'#191d1d',cue:'#f4f4ec'};
let db,session=null,state=null,balls=makeBalls(),pollTimer=null,heartbeat=null;
let activeShot=false,lastFrame=-1,aiming=false,drag=null,previous=0,lastFrameSent=0,shotStarted=0;
let firstHit=null,ownPocket=false,whitePocket=false,blackPocket=false,localWinner=null,placing=false,finishedUi=false,polling=false,joinMode=false,framePending=null;
let announcedTurn=null,turnToastTimer=null;
const canvas=$('table'),ctx=canvas.getContext('2d');
let sx=1,sy=1,scale=1,dpr=1;
function ball(id,type,x,y){return{id,type,x,y,vx:0,vy:0,potted:false}}
function makeBalls(){
 // Match the reference: a wide five-ball row tapering to one, white below.
 const a=[ball(0,'cue',W/2,542)];
 const rows=[
  ['blue','red','blue','blue','red'],
  ['red','blue','red','blue'],
  ['red','black','blue'],
  ['blue','red'],
  ['red']
 ];
 let id=1;
 for(const [row,types] of rows.entries()){
  for(let j=0;j<types.length;j++){
   a.push(ball(id++,types[j],W/2+(j-(types.length-1)/2)*28.9,277+row*25.6));
  }
 }
 return a;
}
function remaining(type){return balls.filter(b=>b.type===type&&!b.potted).length}
function isMyTurn(){return state?.status==='playing'&&state.turn===state.seat&&!state.active&&!activeShot}
function myColor(){return state?.seat===0?'red':'blue'}
function otherColor(){return state?.seat===0?'blue':'red'}
function seatName(n){return state?.players?.[n]?.name||'Bekleniyor'}
function notify(text){let node=$('toast');node.textContent=text;node.hidden=false;clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>node.hidden=true,2800)}
function connection(s){$('network').textContent=s}
function rpc(name,args){return db.rpc(name,args).then(({data,error})=>{if(error)throw Error(error.message||'Sunucu hatası');return data})}
function stored(){try{return JSON.parse(localStorage.getItem(ROOM_KEY)||'null')}catch(_){return null}}
function persist(){try{if(session)localStorage.setItem(ROOM_KEY,JSON.stringify(session))}catch(_){}}
function clearSession(){try{localStorage.removeItem(ROOM_KEY)}catch(_){}}
function choose(type){
 joinMode=type==='join';$('welcome').hidden=true;$('setup').hidden=false;
 $('createForm').hidden=joinMode;$('joinForm').hidden=!joinMode;
 $('setupTitle').textContent=joinMode?'Arkadaşının masasına katıl':'Yeni masa oluştur';
 $('setupDesc').textContent=joinMode?'Dört haneli kodla aynı masada oynayın.':'Masanı oluştur, dört haneli kodunu arkadaşınla paylaş.';
 if(joinMode)$('code').focus();else $('name').focus();
}
function showWelcome(){
 document.body.classList.remove('playing','turn-blue','turn-red');document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#003226');$('game').hidden=true;$('lobby').hidden=false;
 clearTimeout(turnToastTimer);announcedTurn=null;$('turnAnnouncement').hidden=true;
 $('welcome').hidden=false;$('setup').hidden=true;$('winnerModal').hidden=true;
 const st=stored();$('resume').hidden=!st;$('resume').textContent=st?'Son masama dön: '+st.room:'Son masama dön';
}
function localSeatColor(seat){return seat===0?'red':'blue'}
function currentTurnColor(){return state?.status==='playing'?localSeatColor(state.turn):null}
function updateTurnPresentation(){
 const color=currentTurnColor();
 document.body.classList.toggle('turn-blue',color==='blue');
 document.body.classList.toggle('turn-red',color==='red');
 const newKey=color?`${state.room}:${state.turn}`:null;
 if(!newKey){
  if(state?.status==='waiting')announcedTurn=null;
  return;
 }
 if(newKey===announcedTurn)return;
 announcedTurn=newKey;
 const announcement=$('turnAnnouncement');
 announcement.textContent=color==='blue'?"Sıra Mavi'de":"Sıra Kırmızı'da";
 announcement.classList.remove('show','turn-blue','turn-red');
 announcement.classList.add('turn-'+color);
 announcement.hidden=false;
 // Restart the entry animation even if the first two renders are close together.
 void announcement.offsetWidth;
 announcement.classList.add('show');
 clearTimeout(turnToastTimer);
 turnToastTimer=setTimeout(()=>{announcement.classList.remove('show');announcement.hidden=true},1750);
}
async function openRoom(code=null,token=null,override=null){
 if(!db)throw Error('Bağlantı kurulamadı');
 const name=($('name').value.trim()||override||'').slice(0,18);
 if(name.length<2)throw Error('En az iki harfli oyuncu adı yaz');
 const data=await rpc('ob_bilardo_open',{p_venue_id:VENUE,p_name:name,p_code:code,p_token:token});
 if(data.venue!==VENUE)throw Error('İşletme doğrulanamadı');
 session={room:data.room,token:data.token,name};
 persist();state=data;activeShot=false;lastFrame=-1;finishedUi=false;placing=false;announcedTurn=null;
 balls=makeBalls();applySnapshot(state.snapshot);
 enterGame();
}
function enterGame(){
 $('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#f49b7e');
 resize();display();clearInterval(pollTimer);clearInterval(heartbeat);
 pollTimer=setInterval(refresh,480);
 heartbeat=setInterval(()=>{if(session&&!document.hidden&&!activeShot)rpc('ob_bilardo_act',{p_code:session.room,p_token:session.token,p_action:'ping'}).catch(()=>{})},7000);
 refresh();
}
function exitGame(){
 clearInterval(pollTimer);clearInterval(heartbeat);pollTimer=null;heartbeat=null;
 activeShot=false;aiming=false;session=null;state=null;placing=false;clearSession();showWelcome();
}
function display(){
 if(!state)return;
 $('roomLabel').textContent=state.room;
 const me=state.seat,opp=1-me;
 $('myName').textContent=seatName(me);
 $('oppName').textContent=seatName(opp);
 const myC=localSeatColor(me),otherC=localSeatColor(opp);
 $('myScore').textContent=remaining(myC);
 $('oppScore').textContent=remaining(otherC);
 $('bluePotted').textContent=String(7-remaining('blue'));
 $('redPotted').textContent=String(7-remaining('red'));
 document.querySelector('.person.me .colour-dot').className='colour-dot '+myC;
 document.querySelector('.person.opp .colour-dot').className='colour-dot '+otherC;
 $('waiting').hidden=state.status!=='waiting';
 $('presence').textContent=state.players.length<2?'Rakip bekleniyor':state.opponent_online?'● Rakip bağlı':'○ Rakip çevrimdışı';
 if(state.status==='waiting'){
  $('status').textContent='Rakip bekleniyor';$('turnLabel').textContent='Oda hazır';
  $('actionHint').textContent='Kodunu paylaş ve arkadaşını bekle.';
 }else if(state.status==='finished'){
  $('status').textContent='Maç tamamlandı';$('turnLabel').textContent='Oyun sona erdi';
  $('actionHint').textContent='Kazanan belli oldu.';
  showWinner();
 }else if(activeShot||state.active){
  $('status').textContent='Toplar hareket ediyor';$('turnLabel').textContent='Vuruş sürüyor';
  $('actionHint').textContent='Masa iki telefonda güncelleniyor.';
 }else if(state.turn===state.seat){
  $('status').textContent='Sıra sende';$('turnLabel').textContent=placing?'Beyaz topu yerleştir':'Vuruşunu yap';
  $('actionHint').textContent=placing?'Boş bir noktaya dokun.':'Beyaz topu geriye çekip bırak.';
 }else{
  $('status').textContent='Sıra rakipte';$('turnLabel').textContent='Rakibin oynuyor';
  $('actionHint').textContent='Rakibin vuruşunu bekle.';
 }
 $('ballHint').hidden=!(placing&&isMyTurn());
 updateTurnPresentation();
}
function showWinner(){
 if(finishedUi)return;finishedUi=true;
 const mine=state.winner===state.seat;
 $('winnerTitle').textContent=mine?'Kazandın!':'Rakibin kazandı!';
 $('winnerText').textContent=mine?'Tebrikler, 8 numaralı topu başarıyla tamamladın.':'Maç sona erdi; yeni bir oda oluşturarak tekrar oynayabilirsiniz.';
 $('winnerModal').hidden=false;
}
function applySnapshot(data){
 if(!data||!Array.isArray(data.balls)||data.balls.length!==16)return;
 let byId=new Map(data.balls.map(b=>[Number(b.id),b]));
 if(byId.size!==16)return;
 let previousBalls=balls;
 const reconstructed=previousBalls.map(b=>{
  let v=byId.get(b.id);
  return v&&Number.isFinite(Number(v.x))&&Number.isFinite(Number(v.y))
   ?{...b,x:Number(v.x),y:Number(v.y),vx:0,vy:0,potted:!!v.potted}:b;
 });
 balls=reconstructed;
 placing=Boolean(data.placing);
 display();
}
async function refresh(){
 if(!session||polling||document.hidden)return;
 polling=true;
 try{
  const next=await rpc('ob_bilardo_state',{p_code:session.room,p_token:session.token});
  if(!session||next.room!==session.room)return;
  if(!activeShot&&next.frame!==lastFrame){
   lastFrame=next.frame;
   applySnapshot(next.snapshot);
  }
  if(!activeShot)state=next;
  else state={...state,opponent_online:next.opponent_online};
  display();
 }catch(e){$('presence').textContent='Bağlantı yenileniyor';}
 finally{polling=false}
}
function resize(){
 const r=canvas.getBoundingClientRect();
 dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.max(1,Math.floor(r.width*dpr));
 canvas.height=Math.max(1,Math.floor(r.height*dpr));
 sx=canvas.width/W;sy=canvas.height/H;scale=Math.min(sx,sy);
}
function point(e){
 const r=canvas.getBoundingClientRect();
 return{x:(e.clientX-r.left)/Math.max(1,r.width)*W,y:(e.clientY-r.top)/Math.max(1,r.height)*H};
}

function roundedRect(c,x,y,w,h,r){
 const rr=Math.min(r,w/2,h/2);
 c.beginPath();c.moveTo(x+rr,y);c.lineTo(x+w-rr,y);
 c.quadraticCurveTo(x+w,y,x+w,y+rr);
 c.lineTo(x+w,y+h-rr);c.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
 c.lineTo(x+rr,y+h);c.quadraticCurveTo(x,y+h,x,y+h-rr);
 c.lineTo(x,y+rr);c.quadraticCurveTo(x,y,x+rr,y);c.closePath();
}
function draw(){
 if(!ctx)return;
 const c=ctx;
 c.setTransform(sx,0,0,sy,0,0);c.clearRect(0,0,W,H);
 // Narrow the outer band and expand the playable green cloth.
 // Outer band always identifies the player whose turn is active.
 c.fillStyle=currentTurnColor()==='blue'?'#278de8':currentTurnColor()==='red'?'#eb5d60':'#f49b7e';
 c.fillRect(0,0,W,H);
 c.fillStyle='#050505';c.fillRect(0,26,W,10);c.fillRect(0,811,W,11);
 c.fillStyle='#91533b';roundedRect(c,0,37,W,774,9);c.fill();
 c.strokeStyle='#a26649';c.lineWidth=2;roundedRect(c,2,39,W-4,770,9);c.stroke();
 // Black six-pocket rail and a slightly wider vivid-green play surface.
 c.fillStyle='#050604';roundedRect(c,21,62,W-42,731,8);c.fill();
 c.fillStyle='#347e41';c.fillRect(34,81,W-68,698);
 c.fillStyle='#4fc75e';c.fillRect(48,81,W-96,698);
 const g=c.createLinearGradient(34,0,62,0);
 g.addColorStop(0,'#1e6434aa');g.addColorStop(1,'#31864500');
 c.fillStyle=g;c.fillRect(34,81,28,698);
 for(const pocket of pockets){
  c.beginPath();c.arc(pocket.x,pocket.y,28,0,Math.PI*2);
  c.fillStyle='#030404';c.fill();
 }
 // The reference uses direct aiming and a simple shot line.
 if(aiming&&drag&&!activeShot){
  const cue=balls[0];const dx=cue.x-drag.x,dy=cue.y-drag.y;
  const length=Math.hypot(dx,dy);
  if(length>3){
   const ux=dx/length,uy=dy/length;
   c.save();c.setLineDash([7,7]);c.strokeStyle='#f4fae6a8';c.lineWidth=2;
   c.beginPath();c.moveTo(cue.x,cue.y);c.lineTo(cue.x+ux*200,cue.y+uy*200);c.stroke();c.restore();
   c.strokeStyle='#ead1a0';c.lineWidth=5;c.beginPath();
   c.moveTo(cue.x-ux*22,cue.y-uy*22);
   c.lineTo(cue.x-ux*(65+Math.min(150,length)),cue.y-uy*(65+Math.min(150,length)));c.stroke();
  }
 }
 // Balls share the same positions used by physics on mobile and desktop.
 for(const b of balls){
  if(b.potted)continue;
  c.beginPath();c.arc(b.x+4,b.y+4,RADIUS+1,0,Math.PI*2);c.fillStyle='#07371e7b';c.fill();
  if(b.type==='cue'){
   c.beginPath();c.arc(b.x,b.y,RADIUS+24,0,Math.PI*2);c.fillStyle='#bafa596c';c.fill();
  }
  c.beginPath();c.arc(b.x,b.y,RADIUS,0,Math.PI*2);
  c.fillStyle='#050606';c.fill();
  c.beginPath();c.arc(b.x,b.y,RADIUS-6.9,0,Math.PI*2);
  c.fillStyle=b.type==='red'?'#ff615c':b.type==='blue'?'#0cb0ef':b.type==='cue'?'#fdfdfa':'#08090a';
  c.fill();
  if(b.type==='black'){
   c.beginPath();c.arc(b.x,b.y,6.4,0,Math.PI*2);c.fillStyle='#fff';c.fill();
   c.fillStyle='#161616';c.font='900 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('8',b.x,b.y+.6);
  }
 }
}
function serialize(next=null,winner=null){
 return{balls:balls.map(b=>({id:b.id,type:b.type,x:Math.round(b.x*100)/100,y:Math.round(b.y*100)/100,potted:!!b.potted})),placing:placing,shot:state.shot,next,winner};
}
function ballCollision(a,b){
 if(a.potted||b.potted)return;
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=RADIUS*2;
 if(d===0||d>=min)return;
 if(firstHit===null){
  if(a.type==='cue'&&b.type!=='cue')firstHit=b.type;
  else if(b.type==='cue'&&a.type!=='cue')firstHit=a.type;
 }
 const nx=dx/d,ny=dy/d,over=min-d;
 a.x-=nx*over/2;a.y-=ny*over/2;b.x+=nx*over/2;b.y+=ny*over/2;
 const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
 if(rel>0)return;
 const impulse=-(1+.92)*rel/2;
 a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
}
function physics(dt){
 const step=Math.min(2.1,dt/16.6667);
 for(const b of balls){
  if(b.potted)continue;
  b.x+=b.vx*step;b.y+=b.vy*step;
  b.vx*=Math.pow(.984,step);b.vy*=Math.pow(.984,step);
  if(Math.hypot(b.vx,b.vy)<.11)b.vx=b.vy=0;
  for(const p of pockets){
   const dx=p.x-b.x,dy=p.y-b.y,dist=Math.hypot(dx,dy);
   // An approach inside the mouth should be accepted before the cushion bounces.
   if(dist<POCKET_CAPTURE_RADIUS){
    b.potted=true;b.vx=b.vy=0;
    if(b.type==='cue')whitePocket=true;
    else if(b.type==='black')blackPocket=true;
    else if(b.type===myColor())ownPocket=true;
    break;
   }
   // Gentle inward guidance near the lip, without affecting normal table play.
   if(dist<POCKET_GUIDE_RADIUS&&dist>0){
    const approach=(b.vx*dx+b.vy*dy)/dist;
    if(approach>0.2){
      b.vx+=dx/dist*.12*step;
      b.vy+=dy/dist*.12*step;
    }
   }
  }
  if(b.potted)continue;
  if(b.x-RADIUS<LEFT){b.x=LEFT+RADIUS;b.vx=Math.abs(b.vx)*.87}
  if(b.x+RADIUS>RIGHT){b.x=RIGHT-RADIUS;b.vx=-Math.abs(b.vx)*.87}
  if(b.y-RADIUS<TOP){b.y=TOP+RADIUS;b.vy=Math.abs(b.vy)*.87}
  if(b.y+RADIUS>BOTTOM){b.y=BOTTOM-RADIUS;b.vy=-Math.abs(b.vy)*.87}
 }
 for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)ballCollision(balls[i],balls[j]);
}
function validWhiteLocation(x,y){
 if(x<LEFT+RADIUS+3||x>RIGHT-RADIUS-3||y<TOP+RADIUS+3||y>BOTTOM-RADIUS-3)return false;
 return balls.every(b=>b.id===0||b.potted||Math.hypot(b.x-x,b.y-y)>RADIUS*2+3);
}
function beginPlace(x,y){
 if(!validWhiteLocation(x,y)){notify('Beyaz topu boş bir noktaya koy');return}
 const cue=balls[0];cue.x=x;cue.y=y;cue.potted=false;cue.vx=cue.vy=0;placing=false;display();
}
async function shot(dx,dy,speed){
 if(!isMyTurn()||activeShot)return;
 activeShot=true;shotStarted=0;
 try{
  const snapshot=await rpc('ob_bilardo_act',{p_code:session.room,p_token:session.token,p_action:'shot',p_payload:{dx,dy,speed}});
  state=snapshot;firstHit=null;ownPocket=false;whitePocket=false;blackPocket=false;localWinner=null;
  const cue=balls[0];cue.vx=dx*speed;cue.vy=dy*speed;
  shotStarted=performance.now();lastFrameSent=0;display();
 }catch(e){activeShot=false;shotStarted=0;notify(e.message);await refresh()}
}
async function sendFrame(action,next=null,winner=null){
 if(!session||!state)return;
 const snapshot=serialize(next,winner);
 const response=await rpc('ob_bilardo_act',{p_code:session.room,p_token:session.token,
  p_action:action,p_payload:snapshot});
 if(!session)return;
 state=response;lastFrame=state.frame;
}
async function finishShot(){
 if(!activeShot||!session)return;
 const seat=state.seat,opponent=1-seat;
 const foul=whitePocket||(firstHit!==myColor()&&!(firstHit==='black'&&remaining(myColor())===0));
 let winner=null,next=opponent;
 if(blackPocket){winner=remaining(myColor())===0&&!foul?seat:opponent;}
 else if(!foul&&ownPocket){next=seat;}
 if(whitePocket){
  const cue=balls[0];cue.potted=false;cue.x=W/2;cue.y=H*.8;
  if(!validWhiteLocation(cue.x,cue.y))cue.y=H*.67;
  placing=true;
 }
 try{
  await sendFrame('finish',next,winner);
 }catch(e){notify('Vuruş kaydedilemedi: '+e.message)}
 activeShot=false;display();
}
function animate(t){
 const dt=previous?Math.min(33,t-previous):16;previous=t;
 if(activeShot&&shotStarted>0){
  physics(dt);
  const moving=balls.some(b=>!b.potted&&Math.hypot(b.vx,b.vy)>.12);
  if(t-lastFrameSent>200&&!framePending){
   lastFrameSent=t;
   framePending=sendFrame('frame').catch(()=>{}).finally(()=>{framePending=null});
  }
  if(!moving&&t-shotStarted>160){
   activeShot=false;
   finishShotFromLoop();
  }else if(t-shotStarted>24000){
   balls.forEach(b=>{b.vx=b.vy=0});
   activeShot=false;finishShotFromLoop();
  }
 }
 draw();requestAnimationFrame(animate);
}
let finalizing=false;
async function finishShotFromLoop(){
 if(finalizing||!session)return;
 finalizing=true;activeShot=true;
 try{
  if(framePending)await framePending.catch(()=>{});
  await finishShot();
 }finally{activeShot=false;shotStarted=0;finalizing=false}
}
function pointerDown(e){
 if(!isMyTurn())return;
 e.preventDefault();
 const p=point(e);
 if(placing){beginPlace(p.x,p.y);return}
 const cue=balls[0];
 if(cue.potted)return;
 if(Math.hypot(p.x-cue.x,p.y-cue.y)>65){notify('Beyaz topu tutup geriye çek');return}
 aiming=true;drag=p;try{canvas.setPointerCapture(e.pointerId)}catch(_){}
}
function pointerMove(e){
 if(!aiming)return;e.preventDefault();drag=point(e);
 const c=balls[0],power=Math.min(1,Math.hypot(c.x-drag.x,c.y-drag.y)/180);
 $('powerFill').style.width=Math.round(power*100)+'%';
}
function pointerUp(e){
 if(!aiming)return;aiming=false;e.preventDefault();
 const c=balls[0],p=point(e),dx=c.x-p.x,dy=c.y-p.y;
 drag=null;$('powerFill').style.width='0%';
 const dist=Math.hypot(dx,dy);
 if(dist<16)return;
 const speed=5+Math.min(1,dist/180)*13.6;
 shot(dx/dist,dy/dist,speed);
}
function closeRules(){$('rulesModal').hidden=true;$('rulesOpen').focus()}
async function shareCode(){
 if(!session)return;
 const url=new URL(location.href);url.searchParams.set('masa',session.room);
 const msg='OynaBak Bilardo oda kodum: '+session.room+'\n'+url.href;
 if(navigator.share){try{await navigator.share({title:'OynaBak Bilardo',text:msg,url:url.href});return}catch(_){}}
 try{await navigator.clipboard.writeText(msg);notify('Oda kodu kopyalandı')}catch(_){notify('Oda kodun: '+session.room)}
}
function events(){
 $('createChoose').onclick=()=>choose('create');$('joinChoose').onclick=()=>choose('join');
 $('setupBack').onclick=()=>{$('setup').hidden=true;$('welcome').hidden=false};
 $('rulesOpen').onclick=()=>{$('rulesModal').hidden=false;$('rulesClose').focus()};
 $('rulesClose').onclick=closeRules;$('rulesDone').onclick=closeRules;
 $('rulesModal').onclick=e=>{if(e.target===$('rulesModal'))closeRules()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('rulesModal').hidden)closeRules()});
 $('code').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,4)};
 const submit=(code,token=null,override=null)=>openRoom(code,token,override).catch(e=>notify(e.message));
 $('createForm').onsubmit=e=>{e.preventDefault();submit(null)};
 $('joinForm').onsubmit=e=>{e.preventDefault();
  const code=$('code').value.trim();
  if(!/^[0-9]{4}$/.test(code)){notify('4 haneli kod yaz');return}
  submit(code);
 };
 $('resume').onclick=()=>{const s=stored();if(s)submit(s.room,s.token,s.name)};
 $('leave').onclick=exitGame;$('copy').onclick=shareCode;$('winnerExit').onclick=exitGame;
 canvas.addEventListener('pointerdown',pointerDown,{passive:false});
 canvas.addEventListener('pointermove',pointerMove,{passive:false});
 canvas.addEventListener('pointerup',pointerUp,{passive:false});
 canvas.addEventListener('pointercancel',()=>{aiming=false;drag=null;$('powerFill').style.width='0%'},{passive:false});
 window.addEventListener('resize',()=>requestAnimationFrame(resize));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
async function init(){
 events();const params=new URL(location.href).searchParams;
 $('back').href='../?isletme='+encodeURIComponent(VENUE)+'#play';
 if(!/^[0-9a-f-]{36}$/i.test(VENUE)){connection('İşletme bağlantısı gerekli');notify('İşletmenin QR bağlantısından aç');return}
 try{db=window.supabase.createClient(PROJECT,KEY,{auth:{persistSession:false}});connection('● Bağlı')}
 catch(e){connection('Bağlantı kurulamadı');return}
 const old=stored();if(old){$('resume').hidden=false;$('resume').textContent='Son masama dön: '+old.room}
 try{$('name').value=localStorage.getItem(NAME_KEY)||''}catch(_){}
 $('name').addEventListener('change',()=>{try{localStorage.setItem(NAME_KEY,$('name').value.trim())}catch(_){}});
 const code=params.get('masa');if(code&&/^\d{4}$/.test(code)){$('code').value=code;choose('join')}
 resize();requestAnimationFrame(animate);
}
init().catch(e=>notify(e.message));
})();