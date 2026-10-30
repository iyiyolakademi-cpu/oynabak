(() => {
'use strict';
const VENUE='70abef21-053c-4026-b402-e18311f758d5';
const PROJECT='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const $=id=>document.getElementById(id);
const suits=['♠','♥','♣','♦'],suitNames=['Maça','Kupa','Sinek','Karo'];
const nameKey='ob-pisti:name',sessionKey='ob-pisti:session';
let db,game=null,session=null,busy=false,poll=null,toastTimer=null,shownResult='',gesture=null,ghost=null,selectedMode='classic';
const modeNames={quick:'Hızlı Maç',classic:'Klasik Maç',long:'Uzun Maç',single:'Tek El'};
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf=card=>{const rank=card%13+1;return rank===1?'A':rank===11?'J':rank===12?'Q':rank===13?'K':String(rank)};
const suitOf=card=>suits[Math.floor(card/13)];
const cardText=card=>suitNames[Math.floor(card/13)]+' '+nameOf(card);
function cardHTML(card,classes=''){
 if(!Number.isInteger(card))return '<span class="empty-pile">Kart yok</span>';
 const symbol=suitOf(card),rank=nameOf(card),red=card>=13&&card<=25||card>=39;
 return '<span class="card '+(red?'red':'black')+' '+classes+'" data-card="'+card+'" role="img" aria-label="'+esc(cardText(card))+'">'+
 '<span class="corner">'+rank+'<small>'+symbol+'</small></span>'+
 '<span class="big-suit">'+symbol+'</span>'+
 '<span class="corner bottom-corner">'+rank+'<small>'+symbol+'</small></span></span>';
}
function toast(msg){
 const el=$('toast');el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{el.hidden=true},4500);
}
function connection(message,bad=false){const e=$('network');e.textContent=message;e.classList.toggle('off',bad)}
function rpc(name,args){return db.rpc(name,args).then(({data,error})=>{if(error)throw Error(error.message||'Sunucu yanıt vermedi');return data})}
function saveSession(){
 try{if(session)localStorage.setItem(sessionKey,JSON.stringify(session))}catch(_){}
}
function chooseMatchMode(mode){
 if(!Object.prototype.hasOwnProperty.call(modeNames,mode))return;
 selectedMode=mode;
 document.querySelectorAll('#matchModes [data-mode]').forEach(button=>{
  const active=button.dataset.mode===mode;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 });
}
function chooseMode(mode){
 const join=mode==='join';
 $('createForm').hidden=join;$('joinForm').hidden=!join;
 $('chooseCreate').classList.toggle('active',!join);$('chooseJoin').classList.toggle('active',join);
 $('chooseCreate').setAttribute('aria-selected',String(!join));
 $('chooseJoin').setAttribute('aria-selected',String(join));
 $('pistiFormTitle').textContent=join?'Arkadaşının masasına katıl':'Yeni oyun oluştur';
 if(join)$('joinCode').focus();
}
function username(){
 const name=$('playerName').value.trim();
 if(name.length<2){toast('Lütfen en az 2 karakterlik adını gir.');$('playerName').focus();return null}
 return name;
}
function writeNames(){
 const you=game.players?.[game.seat],them=game.players?.[1-game.seat];
 $('selfName').textContent=you?.name||'Sen';$('opponentName').textContent=them?.name||'Rakip bekleniyor';
 $('topOpponentName').textContent=them?.name||'Rakip bekleniyor';
 $('bottomName').textContent=you?.name||'Sen';
 $('opponentAvatar').textContent=(them?.name||'?').charAt(0).toLocaleUpperCase('tr-TR');
 $('selfPoints').textContent=game.scores?.[game.seat]??0;
 $('opponentPoints').textContent=game.scores?.[1-game.seat]??0;
 $('selfCollected').textContent=(you?.collected_count||0)+' kart topladın';
 $('opponentCollected').textContent=(them?.collected_count||0)+' kart topladı';
 const single=game.mode==='single';
 $('targetCaption').textContent=single?'MOD':'HEDEF';
 $('targetValue').textContent=single?'1 EL':String(game.target||101);
 $('roundLabel').textContent=single?'TEK EL':(game.round||0)+'. EL';
}
function render(){
 if(!game)return;
 document.body.classList.add('pisti-playing');
 $('lobby').hidden=true;$('game').hidden=false;
 $('roomLabel').textContent=game.room;
 const firstTurn=game.status==='playing'&&game.round===1&&game.move<=1;
 $('openingBanner').hidden=!firstTurn;
 if(firstTurn){
  const mine=game.turn===game.seat;
  $('openingText').textContent=mine?'İlk kartı sen oynayacaksın':'İlk kartı rakibin oynayacak';
  $('openingBanner').classList.toggle('my-first-turn',mine);
 }
 writeNames();
 const them=game.players?.[1-game.seat];
 const oppCount=them?.hand_count||0;
 $('opponentHand').innerHTML=Array.from({length:oppCount},()=>'<span class="card-back" aria-label="Kapalı kart"></span>').join('');
 $('stockLabel').textContent=game.stock_count+' kart';
 $('pileLabel').textContent='Ortada '+game.pile_count+' kart';
 $('centerPile').innerHTML=(game.pile_top===null?'<span id="pileCard" class="empty-pile">Yerde kart yok</span>':cardHTML(game.pile_top,'on-top').replace('class="card ', 'id="pileCard" class="card '))+
 '<small id="pileLabel">Ortada '+game.pile_count+' kart</small>';
 const theirTurn=game.turn!==game.seat;
 const playing=game.status==='playing';
 const myTurn=playing&&!theirTurn;
 $('opponentTurn').textContent=!playing?'Masa bekleniyor':theirTurn?'Sırası onda':'Seni bekliyor';
 $('bottomTurn').textContent=myTurn?'Sıra sende!':playing?'Sıra rakibinde':'Oyun bekleniyor';
 $('playHint').textContent=myTurn?'Kartını ortaya bırak':'Ortadaki kartı takip et';
 $('statusText').textContent=game.status==='waiting'?'Arkadaşın bekleniyor':game.status==='playing'?(myTurn?'● Sıra sende':'● Rakip oynuyor'):game.status==='finished'?'Maç tamamlandı':'El tamamlandı';
 $('handLabel').textContent=game.hand?.length+' kart';
 $('actionHint').textContent=game.status==='waiting'?'Kodu arkadaşınla paylaş, oyun otomatik başlasın.':
  myTurn?'Oynamak istediğin karta dokun veya masaya sürükle.':
  playing?'Rakibin hamlesi bekleniyor.':game.status==='finished'?'Kazanan belli oldu!':'Yeni el için hazır ol.';
 $('hand').innerHTML=(game.hand||[]).map(id=>{
  const card=cardHTML(id);
  return '<button type="button" class="hand-card" data-card="'+id+'" aria-label="'+esc(cardText(id))+' kartını oyna" '+(!myTurn||busy?'disabled':'')+'>'+card+'</button>';
 }).join('');
 $('felt').classList.toggle('my-turn',myTurn);
 if(game.status==='round_finished'||game.status==='finished')showResult();
}
function showResult(){
 const last=game.last_action||{};
 const key=game.room+':'+game.round+':'+game.status;
 if(key===shownResult)return;shownResult=key;
 const isMatch=game.status==='finished';
 const who=last.winner;
 const name=who===null?'Berabere':game.players[who]?.name||'Oyuncu';
 $('resultSymbol').textContent=isMatch?'♠':'♦';
 $('resultEyebrow').textContent=isMatch?(game.mode==='single'?'TEK EL TAMAMLANDI':'MAÇ TAMAMLANDI'):game.round+'. EL BİTTİ';
 $('resultTitle').textContent=isMatch?(who===null?'Berabere!':who===game.seat?'Kazandın!':name+' kazandı!'):'El tamamlandı';
 $('resultName0').textContent=game.players[0]?.name||'1. oyuncu';
 $('resultName1').textContent=game.players[1]?.name||'2. oyuncu';
 $('resultScore0').textContent=game.scores[0];$('resultScore1').textContent=game.scores[1];
 const matchLabel=game.mode==='single'?'Tek el':(game.target||101)+' puanlık maç';
 $('resultMessage').textContent=isMatch?
  (game.mode==='single'?'Bir deste bitti; en yüksek puan kazandı. ':'Hedef puana ulaşıldı. ')+
  'Sonuç: '+game.scores[0]+' – '+game.scores[1]+'. İkiniz hazır olunca yeni '+(game.mode==='single'?'ele':'maça')+' geçebilirsiniz.':
 'Bu el: '+(last.round_scores?.[0]||0)+' – '+(last.round_scores?.[1]||0)+
 '. '+matchLabel+' devam ediyor; yeni ele başlamak için ikiniz de hazır olmalısınız.';
 const ready=game.ready?.[game.seat]===true;
 $('readyButton').disabled=ready;
 $('readyButton').textContent=ready?'Rakibin bekleniyor…':isMatch?(game.mode==='single'?'Yeni Tek Ele Hazırım →':'Yeni Maça Hazırım →'):'Sonraki Ele Hazırım →';
 $('resultModal').hidden=false;
}
async function refresh(){
 if(!session||busy||!navigator.onLine)return;
 try{
  const next=await rpc('ob_pisti_state',{p_code:session.room,p_token:session.token});
  if(!game||next.move!==game.move||next.status!==game.status||next.players.length!==game.players.length){
   const prev=game?.last_action;game=next;render();
   const move=next.last_action||{};
   if(move.event==='play'&&move.pisti&&(!prev||prev.card!==move.card||prev.seat!==move.seat||prev.round!==move.round)){
    toast((next.players[move.seat]?.name||'Oyuncu')+' PİŞTİ! +'+move.pisti+' puan 🎉');
   }
  }
  connection('● Bağlı');
 }catch(err){connection('● Bağlantı hatası',true);console.warn('Pişti güncelleme:',err)}
}
function setPolling(){if(poll)clearInterval(poll);poll=setInterval(refresh,1100)}
async function openRoom(name,code='',token=null){
 if(busy)return;
 if(!navigator.onLine){toast('Oynayabilmek için internet bağlantısı gerekli.');return}
 busy=true;connection('● Bağlanıyor');
 document.querySelectorAll('#lobby button[type="submit"]').forEach(b=>b.disabled=true);
 try{
  const next=await rpc('ob_pisti_open_v2',{p_venue_id:VENUE,p_name:name,p_code:code||null,p_token:token||null,p_mode:selectedMode});
  if(!next?.room||!next?.token)throw Error('Masa oluşturulamadı');
  session={room:next.room,token:next.token,name};saveSession();
  try{localStorage.setItem(nameKey,name)}catch(_){}
  game=next;shownResult='';$('resultModal').hidden=true;
  $('resume').hidden=false;$('resume').textContent='Son masama dön: '+game.room;
  render();setPolling();connection('● Bağlı');
  if(game.status==='waiting')toast('Masa kuruldu! Kod: '+game.room+'. Arkadaşını davet et.');
  if(!code)rpc('ob_event_v3',{vid:VENUE,et:'game_open',t:0,k:'pisti:'+game.room,g:'pisti'}).catch(()=>{});
 }catch(err){toast(err.message);connection('● Bağlanamadı',true)}
 finally{busy=false;document.querySelectorAll('#lobby button[type="submit"]').forEach(b=>b.disabled=false);if(game&&!$('game').hidden)render()}
}
async function play(card){
 if(!game||busy||game.status!=='playing'||game.turn!==game.seat)return;
 if(!game.hand.includes(card))return;
 busy=true;
 $('hand').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{
  const next=await rpc('ob_pisti_act',{p_code:session.room,p_token:session.token,p_action:'play',p_card:card});
  game=next;render();
  if(next.last_action?.pisti)toast('PİŞTİ! +'+next.last_action.pisti+' puan 🎉');
  else if(next.last_action?.collected)toast(next.last_action.count+' kart topladın!');
  if(next.status==='finished')rpc('ob_event_v3',{vid:VENUE,et:'game_finish',t:0,k:'pisti:'+session.room+':'+next.round,g:'pisti',s:100}).catch(()=>{});
 }catch(err){toast(err.message);render()}
 finally{busy=false;if(game)render()}
}
async function ready(){
 if(!game||busy||!['round_finished','finished'].includes(game.status))return;
 busy=true;$('readyButton').disabled=true;
 try{
  const next=await rpc('ob_pisti_act',{p_code:session.room,p_token:session.token,p_action:'ready'});
  game=next;render();$('readyButton').disabled=next.status!=='playing';
  if(next.status==='playing'){$('resultModal').hidden=true;shownResult='';toast('Yeni el başladı!')}
  else $('readyButton').textContent='Rakibin bekleniyor…';
 }catch(err){toast(err.message);$('readyButton').disabled=false}
 finally{busy=false;if(game)render()}
}
function showLobby(){
 document.body.classList.remove('pisti-playing');
 $('game').hidden=true;$('resultModal').hidden=true;$('lobby').hidden=false;
 if(poll){clearInterval(poll);poll=null}
 if(session){$('resume').hidden=false;$('resume').textContent='Son masama dön: '+session.room}
}
function inviteUrl(){
 const url=new URL(location.href);url.searchParams.set('isletme',VENUE);
 url.searchParams.set('masa',game.room);return url.href;
}
async function shareRoom(){
 if(!game)return;
 const url=inviteUrl();
 try{
  if(navigator.share)await navigator.share({title:'OynaBak · Pişti',text:'Pişti masama katıl. Kod: '+game.room,url});
  else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Davet bağlantısı kopyalandı!')}
  else toast('Masa kodun: '+game.room);
 }catch(e){if(e?.name!=='AbortError')toast('Masa kodun: '+game.room)}
}
function installTouch(){
 const hand=$('hand'),drop=$('pileDrop');
 hand.addEventListener('pointerdown',event=>{
  const cardButton=event.target.closest('button.hand-card');
  if(!cardButton||cardButton.disabled||gesture)return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  gesture={pointer:event.pointerId,button:cardButton,card:Number(cardButton.dataset.card),
   x:event.clientX,y:event.clientY,moved:false};
  try{cardButton.setPointerCapture(event.pointerId)}catch(_){}
 });
 hand.addEventListener('pointermove',event=>{
  if(!gesture||gesture.pointer!==event.pointerId)return;
  const g=gesture;const delta=Math.hypot(event.clientX-g.x,event.clientY-g.y);
  if(delta>12)g.moved=true;
  if(!g.moved)return;
  event.preventDefault();
  if(!ghost){
   ghost=g.button.querySelector('.card').cloneNode(true);
   ghost.classList.add('ghost');ghost.removeAttribute('data-card');
   document.body.appendChild(ghost);g.button.classList.add('playing');
  }
  ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
  const r=drop.getBoundingClientRect();
  drop.classList.toggle('drag-target',event.clientX>=r.left-15&&event.clientX<=r.right+15&&event.clientY>=r.top-25&&event.clientY<=r.bottom+25);
 });
 const clean=()=>{
  if(gesture?.button)gesture.button.classList.remove('playing');
  ghost?.remove();ghost=null;drop.classList.remove('drag-target');gesture=null;
 };
 hand.addEventListener('pointerup',event=>{
  if(!gesture||gesture.pointer!==event.pointerId)return;
  const g=gesture,r=drop.getBoundingClientRect();
  const playNow=!g.moved || (event.clientX>=r.left-15&&event.clientX<=r.right+15&&event.clientY>=r.top-25&&event.clientY<=r.bottom+25);
  event.preventDefault();
  g.button.dataset.skipClick=String(Date.now()+700);
  clean();
  if(playNow)play(g.card);
 });
 hand.addEventListener('pointercancel',clean);
 hand.addEventListener('lostpointercapture',event=>{if(gesture?.pointer===event.pointerId)clean()});
 hand.addEventListener('click',event=>{
  const b=event.target.closest('button.hand-card');if(!b)return;
  if(Number(b.dataset.skipClick||0)>Date.now()){event.preventDefault();return}
  if(event.detail===0||event.pointerType==='mouse')play(Number(b.dataset.card));
 });
}
function wire(){
 const search=new URL(location.href).searchParams;
 if(search.get('isletme')!==VENUE){
  $('lobby').innerHTML='<div class="lobby-card">Pişti şu anda yalnızca İyi Yol Akademi işletmesinde kullanılabilir.</div>';
  return;
 }
 $('back').href='../?isletme='+encodeURIComponent(VENUE)+'#play';
 let previous=null;try{previous=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch(_){}
 try{$('playerName').value=localStorage.getItem(nameKey)||''}catch(_){}
 $('chooseCreate').addEventListener('click',()=>chooseMode('create'));
 $('chooseJoin').addEventListener('click',()=>chooseMode('join'));
 document.querySelectorAll('#matchModes button[data-mode]').forEach(btn=>{
  btn.addEventListener('click',()=>chooseMatchMode(btn.dataset.mode));
 });
 chooseMatchMode('classic');
 const code=(search.get('masa')||'').toUpperCase();
 if(/^[0-9]{4}$/.test(code)){$('joinCode').value=code;chooseMode('join')}
 $('joinCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,4)});
 $('createForm').addEventListener('submit',e=>{e.preventDefault();const n=username();if(n)openRoom(n)});
 $('joinForm').addEventListener('submit',e=>{
  e.preventDefault();const n=username();if(!n)return;
  const c=$('joinCode').value.trim().toUpperCase();
  if(!/^[0-9]{4}$/.test(c)){toast('4 rakamlı masa kodunu gir.');return}
  openRoom(n,c);
 });
 $('resume').addEventListener('click',()=>{if(session)openRoom(session.name,session.room,session.token)});
 $('switchRoom').addEventListener('click',showLobby);
 $('invite').addEventListener('click',shareRoom);
 $('copyCode').addEventListener('click',async()=>{
  if(!game)return;
  try{await navigator.clipboard.writeText(game.room);toast('Masa kodu kopyalandı: '+game.room)}
  catch{toast('Masa kodun: '+game.room)}
 });
 $('readyButton').addEventListener('click',ready);
 $('dismissResult').addEventListener('click',()=>{$('resultModal').hidden=true});
 installTouch();
 if(previous&&/^(?:[0-9]{4}|[A-F0-9]{6})$/.test(previous.room||'')&&/^[0-9a-f-]{36}$/i.test(previous.token||'')){
  session=previous;$('resume').hidden=false;$('resume').textContent='Son masama dön: '+previous.room;
  // Do not hijack an invite deep link to a different room.
  if(!code||code===previous.room)openRoom(previous.name||'Oyuncu',previous.room,previous.token);
 }
 window.addEventListener('online',()=>{connection('● Yeniden bağlandı');refresh()});
 window.addEventListener('offline',()=>connection('● İnternet yok',true));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
}
function init(){
 if(!window.supabase){connection('● Bağlantı yok',true);toast('Oyun altyapısı yüklenemedi');return}
 db=window.supabase.createClient(PROJECT,KEY);
 connection('● Hazır');wire();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();