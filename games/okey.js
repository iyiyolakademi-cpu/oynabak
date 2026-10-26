(() => {
'use strict';
const VENUE='70abef21-053c-4026-b402-e18311f758d5';
const URL_DB='https://qacmubkcierbpxmdtsph.supabase.co';
const PUBLIC_KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const $=id=>document.getElementById(id);
const colors=['red','blue','black','yellow'];
const colorNames=['Kırmızı','Mavi','Siyah','Sarı'];
const storageKey='ob-okey:current';
let db=null,game=null,session=null,order=[],selected=null,lastRack='',busy=false,poll=null,toastTimer=null,shownEnd='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=msg=>{const el=$('connection');el.textContent=msg;el.className='connection '+(navigator.onLine?'online':'offline')};
const toast=msg=>{const el=$('toast');el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},4500)};
const save=()=>{try{if(session)localStorage.setItem(storageKey,JSON.stringify(session))}catch(_){}};
const rememberName=name=>{try{localStorage.setItem('ob-okey:name',name)}catch(_){}};
function api(name,args){
 if(!db)return Promise.reject(Error('Oyun bağlantısı hazır değil'));
 return db.rpc(name,args).then(({data,error})=>{if(error)throw Error(error.message||'Oyun sunucusu yanıt vermedi');return data});
}
function tileInfo(id,indicator){
 const jokerCol=Math.floor((indicator%52)/13);
 const jokerNum=(indicator%13+1)%13+1;
 if(id>=104)return {color:colors[jokerCol],num:jokerNum,label:'Sahte okey',fake:true,wild:false};
 const col=Math.floor((id%52)/13),num=id%13+1;
 const wild=(jokerCol===col&&jokerNum===num);
 return {color:colors[col],num,label:colorNames[col]+' '+num+(wild?' gerçek okey':''),fake:false,wild};
}
function tileHtml(id,small=false){
 if(!Number.isInteger(id))return '<span class="mini-placeholder">—</span>';
 const t=tileInfo(id,Number(game?.indicator??0));
 return '<span class="tile'+(small?' mini':'')+(t.wild?' joker':'')+(t.fake?' fake':'')+'" data-color="'+t.color+'" data-tile="'+id+'" title="'+esc(t.label)+'">'+
    '<b>'+(t.fake?'★':t.num)+'</b><span class="suit">'+(t.fake?'SAHTE':t.wild?'OKEY':'◆')+'</span></span>';
}
function sortValue(id,mode){
 const t=tileInfo(id,game?.indicator??0);
 const ix=colors.indexOf(t.color);
 if(mode==='numbers')return t.num*4+ix+(t.fake?1000:0);
 return ix*100+t.num+(t.fake?1000:0);
}
function paintRack(force=false){
 if(!game||!Array.isArray(game.hand))return;
 const actual=game.hand.map(Number);
 const unique=new Set(actual);
 order=order.filter(id=>unique.has(id));
 for(const id of actual)if(!order.includes(id))order.push(id);
 if(selected!==null&&!unique.has(selected))selected=null;
 const fingerprint=order.join(',')+'|'+selected+'|'+game.indicator;
 if(!force&&fingerprint===lastRack)return;
 lastRack=fingerprint;
 const rack=$('rack');
 rack.innerHTML=order.map(id=>{
  const t=tileInfo(id,game.indicator??0);
  return '<button type="button" class="tile'+(t.wild?' joker':'')+(t.fake?' fake':'')+(selected===id?' selected':'')+'"'+
   ' data-color="'+t.color+'" data-tile="'+id+'" role="listitem" aria-pressed="'+(selected===id)+'" aria-label="'+esc(t.label)+'">'+
   '<b>'+(t.fake?'★':t.num)+'</b><span class="suit">'+(t.fake?'SAHTE':t.wild?'OKEY':'◆')+'</span></button>';
 }).join('');
}
function updateSeat(element,player,active,me){
 const el=$(element);
 if(!player){
  el.className='seat '+element;
  el.innerHTML='<span class="avatar">+</span><span class="seat-name">Boş koltuk</span><small>Bekleniyor</small>';
  return;
 }
 el.className='seat '+element+(active?' active':'')+(me?' me':'');
 const name=player.name||'Oyuncu';
 el.innerHTML='<span class="avatar">'+esc(name.slice(0,1).toLocaleUpperCase('tr-TR'))+'</span><span class="seat-name">'+esc(name)+(me?' (Sen)':'')+'</span><small>'+player.count+' taş</small>';
}
function render(){
 if(!game)return;
 $('lobby').hidden=true;$('tableView').hidden=false;
 $('roomText').textContent=game.room;
 $('stockCount').textContent=game.stock_count+' taş';
 const indicator=Number.isInteger(game.indicator)?game.indicator:null;
 $('indicator').innerHTML=indicator===null?'—':tileHtml(indicator,true);
 if(indicator!==null){
  const joker=tileInfo(indicator,indicator),n=(joker.num%13)+1;
  $('jokerLabel').textContent='Okey: '+colorNames[colors.indexOf(joker.color)]+' '+n;
 }else $('jokerLabel').textContent='Okey —';
 $('discardTile').outerHTML; // Discard holder stays inside the dedicated target.
 $('takeDiscard').querySelector('#discardTile').innerHTML=game.discard===null?'<span class="mini-placeholder">—</span>':tileHtml(game.discard,true);
 const players=game.players||[],seat=Number(game.seat);
 updateSeat('south',players[seat],game.turn===seat&&game.status==='playing',true);
 updateSeat('west',players[(seat+1)%4],game.turn===(seat+1)%4&&game.status==='playing',false);
 updateSeat('north',players[(seat+2)%4],game.turn===(seat+2)%4&&game.status==='playing',false);
 updateSeat('east',players[(seat+3)%4],game.turn===(seat+3)%4&&game.status==='playing',false);
 $('handCount').textContent=(game.hand||[]).length+' taş';
 const myTurn=game.status==='playing'&&game.turn===seat;
 const draw=myTurn&&game.phase==='draw';
 const discard=myTurn&&game.phase==='discard';
 const canDiscard=discard&&selected!==null&&(game.hand||[]).length===15;
 $('drawStack').disabled=!draw||game.stock_count<=0;
 $('takeDiscard').disabled=!draw||game.discard===null;
 $('discardBtn').disabled=!canDiscard;
 $('finishBtn').disabled=!canDiscard;
 $('moveLeft').disabled=selected===null;$('moveRight').disabled=selected===null;
 $('waitingPanel').textContent=game.status==='waiting'?players.length+'/4 oyuncu katıldı. Diğer oyuncuları bekliyoruz.':'';
 let hint='',top='';
 if(game.status==='waiting'){hint='Masa kodunu arkadaşlarınla paylaş.';top='Oyuncu bekleniyor · '+players.length+'/4'}
 else if(game.status==='finished'){const w=players[game.winner]?.name||'Oyuncu';hint=w+' oyunu bitirdi.';top='Oyun tamamlandı'}
 else if(game.status==='draw'){hint='Destedeki taşlar tükendi. Oyun berabere bitti.';top='Berabere'}
 else if(myTurn&&game.phase==='draw'){hint='Sıra sende. Ortadan veya atılan taşı al.';top='Sıra sende · Taş çek'}
 else if(myTurn){hint='Sıra sende. Atacağın taşı seç ve Taş At’a bas.';top='Sıra sende · Taş at'}
 else {hint=(players[game.turn]?.name||'Diğer oyuncu')+' oynuyor. Hamlesini bekle.';top='Rakibin oynuyor'}
 $('turnHint').textContent=hint;$('roundStatus').textContent=top;
 paintRack();
 if((game.status==='finished'||game.status==='draw')&&shownEnd!==game.room+':'+game.move){
  shownEnd=game.room+':'+game.move;
  $('endTitle').textContent=game.status==='draw'?'Oyun berabere bitti':(game.winner===seat?'Kazandın! 🎉':'Oyun tamamlandı');
  $('endDescription').textContent=game.status==='draw'?'Ortadaki taşlar tükendi.':(game.winner===seat?'Tebrikler, doğru perlerle elini bitirdin.':(players[game.winner]?.name||'Bir oyuncu')+' elini bitirdi.');
  $('gameEnd').hidden=false;
  if(game.status==='finished'&&game.winner===seat){
   api('ob_event_v3',{vid:VENUE,et:'game_finish',t:0,k:'okey:'+game.room+':'+game.move,g:'okey',s:100}).catch(()=>{});
  }
 }
}
async function refresh(){
 if(!session||busy||!navigator.onLine)return;
 try{
  const next=await api('ob_okey_state',{p_code:session.room,p_token:session.token});
  if(!game||next.move!==game.move||next.status!==game.status||next.players.length!==game.players.length){
    game=next;render();
  }
  status('● Canlı bağlı');
 }catch(err){status('● Bağlantı sorunu');console.warn('Okey refresh:',err);}
}
function beginPolling(){
 if(poll)clearInterval(poll);
 poll=setInterval(refresh,2300);
}
async function joinRoom(name,code='',token=null){
 if(busy)return;
 if(!navigator.onLine){toast('Oyun kurmak için internet gerekli.');return}
 busy=true;status('● Bağlanıyor');
 document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
 try{
  const next=await api('ob_okey_open',{p_venue_id:VENUE,p_name:name,p_code:code||null,p_token:token||null});
  if(!next?.room||!next?.token)throw Error('Masa oluşturulamadı');
  session={room:next.room,token:next.token,name};
  rememberName(name);save();game=next;selected=null;order=[];lastRack='';shownEnd='';$('gameEnd').hidden=true;
  render();beginPolling();status('● Canlı bağlı');
 }catch(err){toast(err.message);status('● Bağlantı sorunu')}
 finally{busy=false;document.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false)}
}
async function doMove(action){
 if(!session||!game||busy)return;
 busy=true;
 const tile=(action==='discard'||action==='finish')?selected:null;
 $('discardBtn').disabled=true;$('finishBtn').disabled=true;
 try{
  const next=await api('ob_okey_act',{p_code:session.room,p_token:session.token,p_action:action,p_tile:tile});
  game=next;selected=null;lastRack='';render();
 }catch(err){toast(err.message);render()}
 finally{busy=false}
}
function shiftSelected(step){
 const index=order.indexOf(selected);if(index<0)return;
 const other=index+step;if(other<0||other>=order.length)return;
 const [t]=order.splice(index,1);order.splice(other,0,t);lastRack='';paintRack();
}
function showLobby(){
 $('tableView').hidden=true;$('lobby').hidden=false;$('gameEnd').hidden=true;
 if(poll){clearInterval(poll);poll=null}
 const stored=session;if(stored){$('resume').hidden=false;$('resume').textContent='Masaya dön: '+stored.room}
}
function wire(){
 const v=new URL(location.href).searchParams.get('isletme');
 if(v!==VENUE){$('lobby').innerHTML='<div class="panel"><h2>Okey burada etkin değil</h2><p>Okey ilk etapta yalnızca İyi Yol Akademi içinde açılabilir.</p><a href="../#play" style="color:#e7bc7c">OynaBak’a dön</a></div>';return}
 const back='../?isletme='+encodeURIComponent(VENUE)+'#play';
 $('goBack').href=back;
 $('leaveTable').addEventListener('click',()=>{location.href=back});
 const cached=(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch(_){return null}})();
 const lastName=(()=>{try{return localStorage.getItem('ob-okey:name')||''}catch(_){return ''}})();
 $('hostName').value=lastName;$('guestName').value=lastName;
 if(cached&&/^[A-F0-9]{6}$/.test(String(cached.room||''))&&/^[0-9a-f-]{36}$/i.test(String(cached.token||''))){
  session=cached;$('resume').hidden=false;$('resume').textContent='Masaya dön: '+cached.room;
  $('resume').addEventListener('click',()=>joinRoom(cached.name||lastName||'Oyuncu',cached.room,cached.token));
  joinRoom(cached.name||lastName||'Oyuncu',cached.room,cached.token);
 }
 $('newGame').addEventListener('submit',e=>{e.preventDefault();joinRoom($('hostName').value.trim())});
 $('joinGame').addEventListener('submit',e=>{
  e.preventDefault();
  const code=$('roomCode').value.toUpperCase().trim();
  if(!/^[A-F0-9]{6}$/.test(code)){toast('6 karakterli masa kodunu gir.');return}
  joinRoom($('guestName').value.trim(),code);
 });
 $('roomCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,6)});
 $('copyRoom').addEventListener('click',async()=>{
  if(!game)return;
  try{await navigator.clipboard.writeText(game.room);toast('Masa kodu kopyalandı: '+game.room)}
  catch{toast('Masa kodun: '+game.room)}
 });
 $('drawStack').addEventListener('click',()=>doMove('draw'));
 $('takeDiscard').addEventListener('click',()=>doMove('take'));
 $('discardBtn').addEventListener('click',()=>doMove('discard'));
 $('finishBtn').addEventListener('click',()=>{if(confirm('Seçili taşı atıp kalan 14 taşla oyunu bitirmek istiyor musun?'))doMove('finish')});
 $('sortColors').addEventListener('click',()=>{order.sort((a,b)=>sortValue(a,'colors')-sortValue(b,'colors'));lastRack='';paintRack()});
 $('sortNumbers').addEventListener('click',()=>{order.sort((a,b)=>sortValue(a,'numbers')-sortValue(b,'numbers'));lastRack='';paintRack()});
 $('moveLeft').addEventListener('click',()=>shiftSelected(-1));
 $('moveRight').addEventListener('click',()=>shiftSelected(1));
 const rack=$('rack');let dragging=null;
 rack.addEventListener('pointerdown',event=>{
  const button=event.target.closest('button[data-tile]');if(!button)return;
  dragging={id:Number(button.dataset.tile),x:event.clientX,y:event.clientY,changed:false};
 });
 rack.addEventListener('pointerup',event=>{
  if(!dragging)return;
  const d=dragging;dragging=null;
  const dragged=Math.hypot(event.clientX-d.x,event.clientY-d.y)>16;
  if(dragged){
   const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-tile]');
   if(target&&rack.contains(target)&&Number(target.dataset.tile)!==d.id){
    const from=order.indexOf(d.id),to=order.indexOf(Number(target.dataset.tile));
    if(from>=0&&to>=0){order.splice(from,1);order.splice(to,0,d.id);selected=d.id;lastRack='';paintRack();return}
   }
  }
  selected=selected===d.id?null:d.id;
  lastRack='';paintRack();renderControls();
 });
 rack.addEventListener('pointercancel',()=>{dragging=null});
 $('closeEnd').addEventListener('click',()=>{$('gameEnd').hidden=true});
 $('newRound').addEventListener('click',()=>{
  $('gameEnd').hidden=true;
  const nm=session?.name||lastName||'Oyuncu';
  if(poll){clearInterval(poll);poll=null}session=null;game=null;joinRoom(nm);
 });
 window.addEventListener('online',()=>{status('● Bağlantı geri geldi');refresh()});
 window.addEventListener('offline',()=>status('● İnternet yok'));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
}
function renderControls(){
 if(!game)return;
 const can=game.status==='playing'&&game.turn===game.seat&&game.phase==='discard'&&selected!==null&&game.hand.length===15;
 $('discardBtn').disabled=!can;$('finishBtn').disabled=!can;
 $('moveLeft').disabled=selected===null;$('moveRight').disabled=selected===null;
}
function init(){
 if(!window.supabase){toast('Oyun kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');status('● Bağlantı yok');return}
 db=window.supabase.createClient(URL_DB,PUBLIC_KEY);
 status('● Hazır');wire();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();