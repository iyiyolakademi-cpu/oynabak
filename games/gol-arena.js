(()=>{
'use strict';
const VENUE=new URL(location.href).searchParams.get('isletme')||'';
const PROJECT='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const STORAGE='ob-gol-arena:room:'+VENUE;
const $=id=>document.getElementById(id);
const W=600,H=940,LEFT=28,RIGHT=572,TOP=35,BOTTOM=905,GOAL_L=209,GOAL_R=391;
const R=29,BR=17;
let db=null,room=null,session=null,channel=null,channelReady=false,board=[],pitchBall=null;
let pollTimer=null,pingTimer=null,polling=false,activeShot=false,remoteAnimating=false,lastSeenShot=0;
let previous=0,lastDraw=0,started=0,selected=-1,drag=null,aiming=false,lastVersion=-1,finishing=false;
let scored=null,finishShown=false,announced='',annTimer=null;
const canvas=$('pitch'),ctx=canvas.getContext('2d');
let sx=1,sy=1,dpr=1;
function object(x,y,team,id,r=R){return{id,team,x,y,vx:0,vy:0,r,potted:false}}
function starting(){
 const result=[
  object(300,802,'blue',0),object(165,721,'blue',1),object(435,721,'blue',2),
  object(222,618,'blue',3),object(378,618,'blue',4),
  object(300,138,'red',5),object(165,219,'red',6),object(435,219,'red',7),
  object(222,322,'red',8),object(378,322,'red',9),
  object(300,470,'ball',10,BR)
 ];
 return result;
}
function setBoard(a){board=a;pitchBall=board[10]}
setBoard(starting());
function notify(s){const el=$('toast');el.textContent=s;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,2900)}
function api(method,args){return db.rpc(method,args).then(({data,error})=>{if(error)throw Error(error.message||'Sunucu hatası');return data})}
function stored(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){return null}}
function save(){try{if(session)localStorage.setItem(STORAGE,JSON.stringify(session))}catch(_){}}
function clear(){try{localStorage.removeItem(STORAGE)}catch(_){}}
function choose(join){$('welcome').hidden=true;$('setup').hidden=false;$('createForm').hidden=join;$('joinForm').hidden=!join;
 $('setupTitle').textContent=join?'Arkadaşının maçına katıl':'Yeni oda oluştur';
 $('setupDescription').textContent=join?'Arkadaşından aldığın dört haneli kodu yaz.':'Gol hedefini seç ve oda kodunu paylaş.'; 
 (join?$('roomCode'):$('playerName')).focus();
}
function lobby(){document.body.classList.remove('playing');$('lobby').hidden=false;$('game').hidden=true;$('welcome').hidden=false;$('setup').hidden=true;
 for(const id of ['confirmModal','finishModal','rulesModal'])$(id).hidden=true;
 $('resume').hidden=!stored();$('resume').textContent=stored()?'Son maça dön: '+stored().room:'Son maça dön';
}
function stop(){clearInterval(pollTimer);clearInterval(pingTimer);pollTimer=pingTimer=null;const old=channel;channel=null;channelReady=false;if(old&&db?.removeChannel)db.removeChannel(old).catch?.(()=>{})}
function leave(){stop();room=null;session=null;activeShot=false;remoteAnimating=false;selected=-1;aiming=false;lastVersion=-1;finishing=false;announced='';finishShown=false;clear();lobby()}
function myTeam(){return room?.team||'blue'}
function activeTeam(){return room?.turn===room?.blue_seat?'blue':'red'}
function canPlay(){return room?.status==='playing'&&room.turn===room.seat&&!room.active&&!activeShot&&!remoteAnimating&&!finishing}
function teamSeat(t){return t==='blue'?room.blue_seat:1-room.blue_seat}
function nameFor(t){return room?.players?.[teamSeat(t)]?.name||'Bekleniyor'}
function appliedSnapshot(v){
 if(!v?.pieces||!Array.isArray(v.pieces)||v.pieces.length!==11)return;
 const fresh=starting();
 for(let i=0;i<11;i++){
  const p=v.pieces[i];if(!p||!Number.isFinite(+p.x)||!Number.isFinite(+p.y))return;
  fresh[i].x=Math.max(LEFT+fresh[i].r,Math.min(RIGHT-fresh[i].r,+p.x));
  fresh[i].y=Math.max(TOP+fresh[i].r,Math.min(BOTTOM-fresh[i].r,+p.y));
 }
 setBoard(fresh);
}
function display(){
 if(!room)return;
 $('roomLabel').textContent=room.room;
 $('blueName').textContent=nameFor('blue');$('redName').textContent=nameFor('red');
 $('blueScore').textContent=room.score_blue;$('redScore').textContent=room.score_red;
 $('scoreMode').textContent='İLK '+room.goal_target+' GOL';
 $('waiting').hidden=room.status!=='waiting';
 $('presence').textContent=room.players.length<2?'Rakip bekleniyor':room.opponent_online?'● Rakip bağlı':'○ Rakip çevrimdışı';
 const turn=activeTeam(),mine=room.turn===room.seat;
 $('turnDot').classList.toggle('black',turn==='red');
 $('turnDot').style.background=turn==='blue'?'#15a9fb':'#ed5c65';
 $('gameStatus').textContent=room.status==='waiting'?'Rakip bekleniyor':room.status==='finished'?'Maç tamamlandı':mine?'Sıra sende':'Sıra onda';
 $('turnText').textContent=room.status==='waiting'?'Rakip bekleniyor':room.status==='finished'?'Maç bitti':mine?'Sıra sende':'Sıra onda';
 $('turnHint').textContent=room.status==='playing'?(turn==='blue'?'Mavi takım':'Kırmızı takım'):'Oda kodunu paylaş';
 document.body.classList.toggle('turn-blue',room.status==='playing'&&turn==='blue');
 document.body.classList.toggle('turn-red',room.status==='playing'&&turn==='red');
 if(room.status==='finished')showFinish();else announce();
}
function announce(){
 if(!room||room.status!=='playing')return;
 const k=room.room+':'+room.turn+':'+room.shot;if(k===announced)return;announced=k;
 $('announcementTitle').textContent=room.turn===room.seat?'Sıra sende':'Sıra onda';
 $('announcementSubtitle').textContent=(activeTeam()==='blue'?'MAVİ':'KIRMIZI')+' OYNUYOR';
 const e=$('turnAnnouncement');e.hidden=false;e.classList.remove('show');void e.offsetWidth;e.classList.add('show');
 clearTimeout(annTimer);annTimer=setTimeout(()=>{e.hidden=true;e.classList.remove('show')},1500);
}
function showFinish(){
 if(finishShown)return;finishShown=true;
 const winner=room.winner;
 $('finishTitle').textContent=winner===null?'Berabere':winner===room.seat?'Kazandın!':'Rakibin kazandı!';
 $('finishReason').textContent='Gol Arena maçı '+room.score_blue+' - '+room.score_red+' tamamlandı.';
 $('finishModal').hidden=false;
}
function resize(){
 const r=canvas.getBoundingClientRect();dpr=Math.min(window.innerWidth<720?1.25:1.5,devicePixelRatio||1);
 canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));
 sx=canvas.width/W;sy=canvas.height/H;
}
function visualPoint(x,y){return myTeam()==='red'?{x:W-x,y:H-y}:{x,y}}
function screenPoint(e){
 const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/Math.max(1,r.width)*W,y=(e.clientY-r.top)/Math.max(1,r.height)*H;
 return myTeam()==='red'?{x:W-x,y:H-y}:{x,y};
}
function drawField(){
 const c=ctx;c.fillStyle='#2f9f32';c.fillRect(0,0,W,H);
 for(let y=0;y<H;y+=115){c.fillStyle=Math.floor(y/115)%2?'#35a832':'#29952e';c.fillRect(LEFT,y,RIGHT-LEFT,115)}
 c.strokeStyle='#edf9e7ba';c.lineWidth=3;c.strokeRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
 c.beginPath();c.moveTo(LEFT,H/2);c.lineTo(RIGHT,H/2);c.stroke();
 c.beginPath();c.arc(W/2,H/2,92,0,Math.PI*2);c.stroke();
 c.fillStyle='#f8fbed';c.beginPath();c.arc(W/2,H/2,6,0,Math.PI*2);c.fill();
 c.strokeRect(165,TOP,270,130);c.strokeRect(165,BOTTOM-130,270,130);
 c.strokeRect(228,TOP,144,66);c.strokeRect(228,BOTTOM-66,144,66);
 c.fillStyle='#12271f';c.fillRect(GOAL_L,9,GOAL_R-GOAL_L,TOP-9);c.fillRect(GOAL_L,BOTTOM,GOAL_R-GOAL_L,26);
 c.strokeStyle='#f3f4e8';c.lineWidth=2;for(let x=GOAL_L;x<=GOAL_R;x+=18){
  c.beginPath();c.moveTo(x,9);c.lineTo(x,TOP);c.moveTo(x,BOTTOM);c.lineTo(x,BOTTOM+26);c.stroke();
 }
 c.beginPath();c.moveTo(GOAL_L,9);c.lineTo(GOAL_R,9);c.moveTo(GOAL_L,BOTTOM+26);c.lineTo(GOAL_R,BOTTOM+26);c.stroke();
}
function draw(){
 if(!room||!document.body.classList.contains('playing'))return;
 const c=ctx;c.setTransform(sx,0,0,sy,0,0);
 // For the red player, the entire pitch is rotated. Their red team stays at bottom.
 c.save();if(myTeam()==='red'){c.translate(W,H);c.rotate(Math.PI)}
 c.clearRect(0,0,W,H);drawField();
 for(const p of board){
  c.beginPath();c.arc(p.x+2,p.y+3,p.r+1,0,Math.PI*2);c.fillStyle='#12201880';c.fill();
  const grad=c.createRadialGradient(p.x-7,p.y-10,1,p.x,p.y,p.r);
  const team=p.team;
  if(team==='blue'){grad.addColorStop(0,'#b2eaff');grad.addColorStop(.5,'#279de0');grad.addColorStop(1,'#0c4e90')}
  else if(team==='red'){grad.addColorStop(0,'#ffb7af');grad.addColorStop(.5,'#e85a60');grad.addColorStop(1,'#8c2031')}
  else{grad.addColorStop(0,'#fff');grad.addColorStop(.8,'#edf3ee');grad.addColorStop(1,'#95a19b')}
  c.fillStyle=grad;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fill();
  c.strokeStyle='#ffffffba';c.lineWidth=3;c.stroke();
  if(p.team==='ball'){
   c.fillStyle='#1c2522';c.beginPath();c.arc(p.x,p.y,8,0,Math.PI*2);c.fill();
  }else{
   c.fillStyle='#ffffffef';c.font='900 14px system-ui';c.textAlign='center';c.textBaseline='middle';
   c.fillText(String(p.id<5?p.id+1:p.id-4),p.x,p.y);
  }
 }
 if(aiming&&selected>=0&&drag){
  const p=board[selected],dx=p.x-drag.x,dy=p.y-drag.y,d=Math.hypot(dx,dy);
  if(d>4){
   c.setLineDash([10,7]);c.strokeStyle='#ffeaaad9';c.lineWidth=4;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+dx/d*140,p.y+dy/d*140);c.stroke();c.setLineDash([]);
  }
 }
 c.restore();
}
function physics(dt){
 const step=Math.min(2,dt/16.667);
 const pieces=board;
 for(const p of pieces){
  p.x+=p.vx*step;p.y+=p.vy*step;
  p.vx*=Math.pow(.968,step);p.vy*=Math.pow(.968,step);
  if(Math.hypot(p.vx,p.vy)<.14){p.vx=p.vy=0}
  if(p.id===10&&p.x>GOAL_L&&p.x<GOAL_R){
   if(p.y-p.r<TOP){scored='blue';return}
   if(p.y+p.r>BOTTOM){scored='red';return}
  }
  if(p.x-p.r<LEFT){p.x=LEFT+p.r;p.vx=Math.abs(p.vx)*.82}
  if(p.x+p.r>RIGHT){p.x=RIGHT-p.r;p.vx=-Math.abs(p.vx)*.82}
  if(p.y-p.r<TOP){p.y=TOP+p.r;p.vy=Math.abs(p.vy)*.82}
  if(p.y+p.r>BOTTOM){p.y=BOTTOM-p.r;p.vy=-Math.abs(p.vy)*.82}
 }
 for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
  const a=pieces[i],b=pieces[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;
  if(d<=0||d>=min)continue;
  const nx=dx/d,ny=dy/d,over=min-d;a.x-=nx*over/2;a.y-=ny*over/2;b.x+=nx*over/2;b.y+=ny*over/2;
  const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(relative>=0)continue;
  const impulse=-(1+.88)*relative/2;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
 }
}
function snap(){
 return{pieces:board.map(p=>({id:p.id,x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100})),shot:room.shot};
}
function connect(){
 if(!session||!db?.channel)return;
 if(channel)db.removeChannel(channel).catch?.(()=>{});
 channel=db.channel('ob-goal-room:'+VENUE+':'+session.room,{config:{broadcast:{self:false}}});
 channel.on('broadcast',{event:'shot'},({payload})=>{if(!payload||!session)return;startRemote(payload);refresh()});
 channel.on('broadcast',{event:'finish'},()=>refresh());
 channel.subscribe(s=>channelReady=s==='SUBSCRIBED');
}
function broadcast(event,payload={}){
 if(!channelReady||!channel)return;
 Promise.resolve(channel.send({type:'broadcast',event,payload})).catch(()=>{});
}
function startRemote(action){
 if(!room||!session||!action||activeShot||remoteAnimating||room.status!=='playing')return;
 if(room.turn===room.seat||!Number.isInteger(action.shot)||action.shot<=lastSeenShot||
    (action.shot!==room.shot+1&&action.shot!==room.shot)||!Number.isInteger(action.player))return;
 const p=board[action.player];if(!p||p.team!==activeTeam())return;
 if(!Number.isFinite(action.vx)||!Number.isFinite(action.vy)||Math.hypot(action.vx,action.vy)>35)return;
 if(room.snapshot)appliedSnapshot(room.snapshot);
 board[action.player].vx=action.vx;board[action.player].vy=action.vy;
 lastSeenShot=action.shot;remoteAnimating=true;scored=null;started=performance.now();
 display();
}
async function refresh(){
 if(!session||polling||document.hidden)return;
 polling=true;const current=session.room;
 try{
  const result=await api('ob_goal_state',{p_code:current,p_token:session.token});
  if(!session||result.room!==current)return;
  if(activeShot){room={...room,opponent_online:result.opponent_online};return}
  if(remoteAnimating&&result.shot<lastSeenShot)return;
  if(remoteAnimating&&(!result.active||result.status==='finished'))remoteAnimating=false;
  if(result.version!==lastVersion&&!remoteAnimating){
   lastVersion=result.version;room=result;appliedSnapshot(result.snapshot);
  }else if(!remoteAnimating)room=result;
  if(result.active&&result.last_action?.type==='shot'&&!remoteAnimating)startRemote(result.last_action);
  display();
 }catch(e){$('presence').textContent='Bağlantı kontrol ediliyor'}finally{polling=false}
}
async function beginShot(index,vx,vy){
 if(!canPlay())return;
 activeShot=true;scored=null;
 try{
  const next=await api('ob_goal_act',{p_code:session.room,p_token:session.token,p_action:'shot',p_payload:{player:index,vx,vy,version:room.version}});
  room=next;lastVersion=next.version;lastSeenShot=next.shot;
  board[index].vx=vx;board[index].vy=vy;started=performance.now();
  broadcast('shot',{shot:next.shot,player:index,vx,vy});
  display();
 }catch(e){activeShot=false;notify(e.message);refresh()}
}
async function finishShot(){
 if(!session||finishing)return;
 finishing=true;
 const team=scored;
 let nb=room.score_blue,nr=room.score_red;
 if(team==='blue')nb++;if(team==='red')nr++;
 if(team)setBoard(starting());
 const payload={...snap(),score_blue:nb,score_red:nr};
 try{
  const next=await api('ob_goal_act',{p_code:session.room,p_token:session.token,p_action:'finish',p_payload:payload});
  room=next;lastVersion=next.version;appliedSnapshot(next.snapshot);
  broadcast('finish',{shot:next.shot});
  if(team){$('goalBanner').textContent='GOOOL!';$('goalBanner').hidden=false;setTimeout(()=>$('goalBanner').hidden=true,1200)}
 }catch(e){notify(e.message)}
 activeShot=false;finishing=false;scored=null;display();
}
function animate(t){
 requestAnimationFrame(animate);
 if(!document.body.classList.contains('playing')||document.hidden){previous=t;return}
 if(t-lastDraw<32)return;
 const dt=previous?Math.min(44,t-previous):32;previous=t;lastDraw=t;
 if(activeShot||remoteAnimating){
  if(dt>24){physics(dt/2);physics(dt/2)}else physics(dt);
  if(scored&&remoteAnimating){setBoard(starting())}
  const moving=board.some(p=>Math.hypot(p.vx,p.vy)>.18);
  if(activeShot&&(!moving||Boolean(scored))&&t-started>250){
   // Lock the local turn until the final state has been accepted by the server.
   activeShot=false;finishShot();
  }else if(activeShot&&t-started>18000){board.forEach(p=>{p.vx=p.vy=0});activeShot=false;finishShot()}
 }
 draw();
}
function pointDown(e){
 if(!canPlay())return;e.preventDefault();const p=screenPoint(e);
 const team=myTeam();const idx=board.findIndex(o=>o.team===team&&Math.hypot(o.x-p.x,o.y-p.y)<o.r+24);
 if(idx<0){selected=-1;return}
 selected=idx;drag=p;aiming=true;try{canvas.setPointerCapture(e.pointerId)}catch(_){}
}
function pointMove(e){if(!aiming)return;drag=screenPoint(e)}
function pointUp(e){
 if(!aiming||selected<0)return;e.preventDefault();const p=screenPoint(e),player=board[selected];
 let dx=player.x-p.x,dy=player.y-p.y;const distance=Math.hypot(dx,dy),index=selected;
 aiming=false;selected=-1;drag=null;
 if(distance<14)return;
 const speed=4+Math.min(distance/145,1)*22;
 beginShot(index,dx/distance*speed,dy/distance*speed);
}
async function openRoom(code=null,token=null,nm=null){
 if(!db)throw Error('Sunucu bağlantısı yok');
 const name=($('playerName').value.trim()||nm||'').slice(0,18);
 if(name.length<2)throw Error('Oyuncu adı en az iki karakter olmalı');
 const target=Number($('goalTarget').value)||3;
 const data=await api('ob_goal_open',{p_venue_id:VENUE,p_name:name,p_code:code,p_token:token,p_goal_target:target});
 if(data.venue!==VENUE)throw Error('İşletme doğrulanamadı');
 session={room:data.room,token:data.token,name};save();
 room=data;lastVersion=data.version;lastSeenShot=data.shot;activeShot=false;remoteAnimating=false;finishShown=false;scored=null;announced='';
 setBoard(starting());appliedSnapshot(data.snapshot);
 $('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');
 resize();display();stop();connect();
 pollTimer=setInterval(refresh,430);
 pingTimer=setInterval(()=>{if(session&&!document.hidden&&!activeShot)api('ob_goal_act',{p_code:session.room,p_token:session.token,p_action:'ping'}).catch(()=>{})},7500);
 refresh();
}
function share(){if(!session)return;const url=new URL(location.href);url.searchParams.set('masa',session.room);
 const text='OynaBak Gol Arena: '+session.room+'\n'+url.href;
 if(navigator.share){navigator.share({title:'Gol Arena',text,url:url.href}).catch(()=>{})}else navigator.clipboard.writeText(text).then(()=>notify('Oda kodu kopyalandı')).catch(()=>notify(session.room))
}
function events(){
 $('chooseCreate').onclick=()=>choose(false);$('chooseJoin').onclick=()=>choose(true);
 $('setupBack').onclick=()=>{$('setup').hidden=true;$('welcome').hidden=false};
 const start=(code=null,token=null,nm=null)=>openRoom(code,token,nm).catch(e=>notify(e.message));
 $('createForm').onsubmit=e=>{e.preventDefault();start()};
 $('joinForm').onsubmit=e=>{e.preventDefault();const code=$('roomCode').value.trim();if(!/^\d{4}$/.test(code)){notify('4 haneli kod yaz');return}start(code)};
 $('roomCode').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
 $('resume').onclick=()=>{const v=stored();if(v)start(v.room,v.token,v.name)};
 $('copyRoom').onclick=share;$('exit').onclick=leave;$('finishExit').onclick=leave;
 $('rulesOpen').onclick=$('rulesInGame').onclick=()=>$('rulesModal').hidden=false;
 $('rulesClose').onclick=$('rulesDone').onclick=()=>$('rulesModal').hidden=true;
 $('rulesModal').onclick=e=>{if(e.target===$('rulesModal'))$('rulesModal').hidden=true};
 $('resign').onclick=()=>$('confirmModal').hidden=false;
 $('cancelResign').onclick=()=>$('confirmModal').hidden=true;
 $('confirmResign').onclick=async()=>{$('confirmModal').hidden=true;
  try{const data=await api('ob_goal_act',{p_code:session.room,p_token:session.token,p_action:'resign'});room=data;display();broadcast('finish',{resign:true})}catch(e){notify(e.message)}
 };
 canvas.addEventListener('pointerdown',pointDown,{passive:false});
 canvas.addEventListener('pointermove',pointMove,{passive:false});
 canvas.addEventListener('pointerup',pointUp,{passive:false});
 canvas.addEventListener('pointercancel',()=>{aiming=false;selected=-1;drag=null},{passive:false});
 window.addEventListener('resize',resize);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
function init(){
 events();$('back').href='../?isletme='+encodeURIComponent(VENUE)+'#play';
 if(!/^[0-9a-f-]{36}$/i.test(VENUE)){$('network').textContent='İşletme QR bağlantısı gerekli';return}
 try{db=window.supabase.createClient(PROJECT,KEY,{auth:{persistSession:false}});$('network').textContent='● Bağlı'}catch(e){$('network').textContent='Sunucu bağlantısı yok';return}
 const v=stored();if(v){$('resume').hidden=false;$('resume').textContent='Son maça dön: '+v.room}
 try{$('playerName').value=localStorage.getItem('ob-goal-player')||''}catch(_){}
 $('playerName').onchange=()=>{try{localStorage.setItem('ob-goal-player',$('playerName').value.trim())}catch(_){}};
 const code=new URL(location.href).searchParams.get('masa');if(code&&/^\d{4}$/.test(code)){$('roomCode').value=code;choose(true)}
 requestAnimationFrame(animate);
}
init();
})();