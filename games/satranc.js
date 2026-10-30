(()=>{
'use strict';
const VENUE=new URL(location.href).searchParams.get('isletme')||'';
const PROJECT='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const $=id=>document.getElementById(id);
const engine=window.OynaChessEngine;
const PIECES={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟︎'};
const STORAGE='ob-satranc:room:'+VENUE;
let db=null,room=null,session=null,lastVersion=-1,selected=-1,legalTargets=[],promoChoices=null;
let pollTimer=null,pingTimer=null,channel=null,connected=false,polling=false,lastAnnounce='',turnTimer=null,finishedShown=false,localFinished=null,pendingMove=false;
function toast(s){const el=$('toast');el.textContent=s;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,2900)}
function api(name,args){return db.rpc(name,args).then(({data,error})=>{if(error)throw Error(error.message||'Bağlantı hatası');return data})}
function saved(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){return null}}
function save(){try{if(session)localStorage.setItem(STORAGE,JSON.stringify(session))}catch(_){}}
function unsave(){try{localStorage.removeItem(STORAGE)}catch(_){}}
function choose(join){
 $('welcome').hidden=true;$('setup').hidden=false;$('createForm').hidden=join;$('joinForm').hidden=!join;
 $('setupTitle').textContent=join?'Masaya katıl':'Yeni oda oluştur';
 $('setupDescription').textContent=join?'Arkadaşından aldığın dört haneli kodu yaz.':'Dört haneli kodu arkadaşınla paylaş.';
 if(join)$('roomCode').focus();else $('playerName').focus();
}
function lobby(){
 document.body.classList.remove('playing');$('lobby').hidden=false;$('game').hidden=true;$('welcome').hidden=false;$('setup').hidden=true;
 for(const id of ['finishModal','drawModal','promotionModal','confirmModal','rulesModal'])$(id).hidden=true;
 $('resume').hidden=!saved();$('resume').textContent=saved()?'Son maça dön: '+saved().room:'Son maça dön';
}
function stop(){
 clearInterval(pollTimer);clearInterval(pingTimer);pollTimer=pingTimer=null;
 if(channel){try{db.removeChannel(channel)}catch(_){}}channel=null;connected=false;
}
function leave(){
 stop();room=null;session=null;lastVersion=-1;selected=-1;promoChoices=null;pendingMove=false;localFinished=null;finishedShown=false;lastAnnounce='';unsave();lobby();
}
function isMyTurn(){return Boolean(room?.status==='playing'&&room.turn===room.color&&!pendingMove&&!localFinished)}
function colorName(color){return color==='w'?'Beyaz':'Siyah'}
function playerAtSeat(seat){return room?.players?.[seat]?.name||'Bekleniyor'}
function display(){
 if(!room)return;
 const me=room.seat,them=1-me,mine=room.color,opposite=mine==='w'?'b':'w',g=engine.current();
 $('roomLabel').textContent=room.room;
 $('selfName').textContent=playerAtSeat(me);$('opponentName').textContent=playerAtSeat(them);
 $('selfColor').textContent=colorName(mine);$('opponentColor').textContent=colorName(opposite);
 $('selfIcon').textContent=PIECES[mine+'k'];$('opponentIcon').textContent=PIECES[opposite+'k'];
 $('selfPanel').classList.toggle('active',room.status==='playing'&&room.turn===mine);
 $('opponentPanel').classList.toggle('active',room.status==='playing'&&room.turn===opposite);
 $('selfTurn').textContent=room.turn===mine?'●':'○';$('opponentTurn').textContent=room.turn===opposite?'●':'○';
 $('waiting').hidden=room.status!=='waiting';
 $('presence').textContent=room.players.length<2?'Rakip bekleniyor':room.opponent_online?'● Rakip bağlı':'○ Rakip çevrimdışı';
 $('turnDot').classList.toggle('black',room.turn==='b');
 const check=room.status==='playing'&&engine.result()===null&&engine.current().board.some(p=>p&&p.c===g.turn&&p.t==='k')&&engine.inCheck(g.board,g.turn);
 $('checkInfo').textContent=check?'ŞAH!':'';
 if(room.status==='waiting')$('turnText').textContent='Rakip bekleniyor';
 else if(room.status==='finished'||localFinished)$('turnText').textContent='Maç tamamlandı';
 else $('turnText').textContent=(room.turn===mine?'Sıra sende':'Sıra onda')+' · '+colorName(room.turn);
 $('drawOffer').disabled=room.status!=='playing'||Boolean(localFinished)||room.draw_offer===room.seat;
 $('resign').disabled=room.status!=='playing'||Boolean(localFinished);
 const history=g.moves||[];
 $('moveHistory').textContent=history.length?history.slice(-6).map((x,i)=>x).join('  ·  '):'İlk hamleyi bekliyor';
 drawBoard();
 if(room.status==='finished'||localFinished){showFinish();return}
 if(room.draw_offer!==null&&room.draw_offer!==undefined&&room.draw_offer!==room.seat){
  $('drawModal').hidden=false;
 }else $('drawModal').hidden=true;
 announce();
}
function announce(){
 if(!room||room.status!=='playing'||localFinished)return;
 const newKey=room.room+':'+room.turn+':'+room.moves.length;
 if(newKey===lastAnnounce)return;
 lastAnnounce=newKey;
 $('announcementTitle').textContent=room.turn===room.color?'Sıra sende':'Sıra onda';
 $('announcementSubtitle').textContent=colorName(room.turn).toUpperCase()+' OYNUYOR';
 const el=$('turnAnnouncement');el.hidden=false;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
 clearTimeout(turnTimer);turnTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('show')},1550);
}
function drawBoard(){
 if(!room)return;
 const g=engine.current(),reverse=room.color==='b';
 const squares=Array.from({length:64},(_,i)=>reverse?63-i:i),last=g.last,checking=engine.inCheck(g.board,g.turn);
 const kingIndex=checking?g.board.findIndex(p=>p?.c===g.turn&&p.t==='k'):-1;
 const root=$('board');
 const frag=document.createDocumentFragment();
 for(const i of squares){
  const row=Math.floor(i/8),col=i%8,p=g.board[i];
  const el=document.createElement('button');el.type='button';el.dataset.square=String(i);
  el.setAttribute('role','gridcell');el.setAttribute('aria-label',engine.squareName(i)+' '+(p?(p.c==='w'?'Beyaz ':'Siyah ')+p.t:'boş'));
  el.className='square '+((row+col)%2===0?'light':'dark')+(i===selected?' selected':'')+
   (legalTargets.some(m=>m.to===i)?' hint':'')+
   (last&&(last.from===i||last.to===i)?' last':'')+(i===kingIndex?' check':'');
  if(p){const piece=document.createElement('span');piece.className='piece '+(p.c==='w'?'white':'black');piece.textContent=PIECES[p.c+p.t];el.appendChild(piece)}
  const shownFile=reverse?col===7:col===0;const shownRank=reverse?row===0:row===7;
  if(shownFile||shownRank){const label=document.createElement('small');label.className='coordinate';label.textContent=shownFile?(8-row):engine.squareName(i)[0];el.appendChild(label)}
  frag.appendChild(el);
 }
 root.replaceChildren(frag);
}
function onSquare(index){
 if(!isMyTurn()||room.status!=='playing')return;
 const g=engine.current(),piece=g.board[index];
 if(piece?.c===room.color){
  selected=selected===index?-1:index;legalTargets=selected>=0?engine.legal(selected):[];drawBoard();return;
 }
 const matches=legalTargets.filter(m=>m.to===index);
 if(matches.length===0){selected=-1;legalTargets=[];drawBoard();return}
 const m=matches[0];
 if(m.promotion){
  promoChoices={from:m.from,to:m.to};$('promotionModal').hidden=false;renderPromotion();return;
 }
 move(m.from,m.to,'q');
}
function renderPromotion(){
 if(!promoChoices)return;
 const frag=document.createDocumentFragment();
 for(const t of ['q','r','b','n']){
  const b=document.createElement('button');b.type='button';b.dataset.piece=t;b.textContent=PIECES[room.color+t];b.title={q:'Vezir',r:'Kale',b:'Fil',n:'At'}[t];frag.appendChild(b);
 }
 $('promotionPieces').replaceChildren(frag);
}
async function move(from,to,promo='q'){
 if(!session||!isMyTurn()||!engine.legal(from).some(m=>m.to===to))return;
 pendingMove=true;
 try{
  const data=await api('ob_chess_act',{p_code:session.room,p_token:session.token,p_action:'move',p_payload:{from,to,promo,version:room.version}});
  await install(data);
  broadcast('move',{version:data.version});
 }catch(e){toast(e.message);await refresh()}finally{pendingMove=false;selected=-1;legalTargets=[];promoChoices=null;$('promotionModal').hidden=true;display()}
}
async function install(data){
 if(!session||data.room!==session.room||data.version<lastVersion)return;
 // Avoid applying unverified or out-of-order moves to the local game.
 try{engine.load(data.moves)}catch(e){toast('Hamle doğrulama hatası. Masayı yenile.');return}
 room=data;lastVersion=data.version;
 localFinished=engine.result();
 if(localFinished&&room.status==='playing')broadcast('finish',{reason:localFinished.reason});
 display();
}
function connect(){
 if(!db?.channel||!session)return;
 if(channel){try{db.removeChannel(channel)}catch(_){}}
 channel=db.channel('ob-chess-room:'+VENUE+':'+session.room,{config:{broadcast:{self:false}}});
 channel.on('broadcast',{event:'changed'},()=>refresh());
 channel.subscribe(s=>{connected=s==='SUBSCRIBED'});
}
function broadcast(kind,payload={}){
 if(!connected||!channel)return;
 Promise.resolve(channel.send({type:'broadcast',event:'changed',payload:{kind,...payload}})).catch(()=>{});
}
async function refresh(){
 if(!session||polling||document.hidden)return;
 polling=true;const original=session.room;
 try{
  const data=await api('ob_chess_state',{p_code:session.room,p_token:session.token});
  if(!session||data.room!==original)return;
  if(data.version!==lastVersion)await install(data);
  else{room={...room,opponent_online:data.opponent_online};$('presence').textContent=data.opponent_online?'● Rakip bağlı':'○ Rakip çevrimdışı'}
 }catch(e){$('presence').textContent='Bağlantı kontrol ediliyor'}finally{polling=false}
}
async function act(action,payload={}){
 if(!session)return;
 try{const data=await api('ob_chess_act',{p_code:session.room,p_token:session.token,p_action:action,p_payload:payload});await install(data);broadcast(action)}
 catch(e){toast(e.message);await refresh()}
}
function showFinish(){
 if(finishedShown)return;
 finishedShown=true;$('drawModal').hidden=true;
 const winner=room.winner||localFinished?.winner||null;
 $('finishTitle').textContent=winner?winner===room.color?'Kazandın!':'Rakibin kazandı!':'Berabere';
 $('finishReason').textContent=room.reason||localFinished?.reason||'Maç sona erdi';
 $('finishModal').hidden=false;
}
async function openRoom(code=null,token=null,nameOverride=null){
 if(!db)throw Error('Sunucu bağlantısı kurulamadı');
 const name=($('playerName').value.trim()||nameOverride||'').slice(0,18);
 if(name.length<2)throw Error('Oyuncu adı en az iki karakter olmalı');
 const data=await api('ob_chess_open',{p_venue_id:VENUE,p_name:name,p_code:code,p_token:token});
 if(data.venue!==VENUE)throw Error('İşletme doğrulanamadı');
 session={room:data.room,token:data.token,name};save();room=null;lastVersion=-1;localFinished=null;finishedShown=false;lastAnnounce='';
 $('lobby').hidden=true;$('game').hidden=false;document.body.classList.add('playing');
 await install(data);
 stop();connect();
 pollTimer=setInterval(refresh,650);
 pingTimer=setInterval(()=>{if(session&&!document.hidden)api('ob_chess_act',{p_code:session.room,p_token:session.token,p_action:'ping'}).catch(()=>{})},8000);
 refresh();
}
async function share(){
 if(!session)return;
 const u=new URL(location.href);u.searchParams.set('masa',session.room);
 const t='OynaBak Satranç: '+session.room+'\n'+u.href;
 if(navigator.share){try{await navigator.share({title:'OynaBak Satranç',text:t,url:u.href});return}catch(_){}}
 try{await navigator.clipboard.writeText(t);toast('Oda kodu kopyalandı')}catch(_){toast('Oda kodun: '+session.room)}
}
function events(){
 $('chooseCreate').onclick=()=>choose(false);$('chooseJoin').onclick=()=>choose(true);
 $('setupBack').onclick=()=>{$('setup').hidden=true;$('welcome').hidden=false};
 const start=(code=null,token=null,nm=null)=>openRoom(code,token,nm).catch(e=>toast(e.message));
 $('createForm').onsubmit=e=>{e.preventDefault();start()};
 $('joinForm').onsubmit=e=>{e.preventDefault();const code=$('roomCode').value.trim();if(!/^\d{4}$/.test(code)){toast('4 haneli oda kodunu yaz');return}start(code)};
 $('roomCode').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
 $('resume').onclick=()=>{const v=saved();if(v)start(v.room,v.token,v.name)};
 $('exit').onclick=leave;$('copyRoom').onclick=share;$('finishExit').onclick=leave;
 $('board').onclick=e=>{const sq=e.target.closest('[data-square]');if(sq)onSquare(Number(sq.dataset.square))};
 $('promotionPieces').onclick=e=>{const b=e.target.closest('[data-piece]');if(!b||!promoChoices)return;move(promoChoices.from,promoChoices.to,b.dataset.piece)};
 $('cancelPromotion').onclick=()=>{promoChoices=null;$('promotionModal').hidden=true};
 $('drawOffer').onclick=()=>act('draw_offer');
 $('acceptDraw').onclick=()=>act('draw_accept');
 $('declineDraw').onclick=()=>act('draw_decline');
 $('resign').onclick=()=>$('confirmModal').hidden=false;
 $('cancelResign').onclick=()=>$('confirmModal').hidden=true;
 $('confirmResign').onclick=()=>{$('confirmModal').hidden=true;act('resign')};
 $('rulesOpen').onclick=()=>$('rulesModal').hidden=false;
 $('rulesClose').onclick=()=>$('rulesModal').hidden=true;
 $('rulesDone').onclick=()=>$('rulesModal').hidden=true;
 $('rulesModal').onclick=e=>{if(e.target===$('rulesModal'))$('rulesModal').hidden=true};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const id of ['rulesModal','confirmModal'])$(id).hidden=true});
}
function init(){
 events();if(!engine){toast('Satranç motoru yüklenemedi');return}
 $('back').href='../?isletme='+encodeURIComponent(VENUE)+'#play';
 if(!/^[0-9a-f-]{36}$/i.test(VENUE)){$('network').textContent='İşletme QR bağlantısı gerekli';return}
 try{db=window.supabase.createClient(PROJECT,KEY,{auth:{persistSession:false}});$('network').textContent='● Bağlı'}catch(e){$('network').textContent='Sunucu bağlantısı yok';return}
 const st=saved();if(st){$('resume').hidden=false;$('resume').textContent='Son maça dön: '+st.room}
 try{$('playerName').value=localStorage.getItem('ob-chess-name')||''}catch(_){}
 $('playerName').onchange=()=>{try{localStorage.setItem('ob-chess-name',$('playerName').value.trim())}catch(_){}};
 const auto=new URL(location.href).searchParams.get('masa');if(auto&&/^\d{4}$/.test(auto)){$('roomCode').value=auto;choose(true)}
}
init();
})();