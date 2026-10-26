(()=>{'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.OynaBakStaffPinConfig||{};
const db=window.supabase?.createClient?.(cfg.url,cfg.key,{auth:{storageKey:'oynabak-staff-pin-session',autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
let device=null,pending=false;
const activeRoute=()=>location.hash==='#personel';
const label=r=>({waiter:'Garson',kitchen:'Mutfak',bar:'Bar',manager:'Yönetici'}[r]||r||'Personel');
async function rpc(fn,args={}){if(!db)throw Error('Bağlantı kurulamadı');const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data}
function wrap(content){if(!activeRoute()||!$('#app'))return;$('#app').innerHTML='<main class="ob-staff-pin-screen"><section class="ob-staff-pin-shell"><header><div><small>OYNABAK / PERSONEL</small><h1>E-postasız giriş</h1><p>Garson, mutfak ve bar için tek site.</p></div><a href="'+esc(location.pathname)+'#panel">Yönetici girişi</a></header>'+content+'<p id="ob-pin-message" role="alert"></p></section></main>'}
function notice(s){const n=$('#ob-pin-message');if(n)n.textContent=s}
function context(){return activeRoute()&&device?.paired&&device?.active&&device?.unlocked?{db,me:{role:'staff'},adminData:null}:null}
function pairForm(){
 wrap('<div class="ob-staff-pin-card"><h2>Bu cihazı eşleştir</h2><p>Yönetici panelinden 10 dakikalık eşleştirme kodu oluşturun. Sonra 6 haneli kişisel PIN belirleyin.</p><form id="ob-staff-pair-form"><label>Eşleştirme kodu<input name="code" autocomplete="off" maxlength="24" minlength="24" required placeholder="24 karakter"></label><label>Yeni personel PIN’i<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required autocomplete="new-password"></label><button type="submit">Cihazı eşleştir</button></form><p>E-posta ve parola istenmez.</p></div>');
}
function unlockForm(){
 wrap('<div class="ob-staff-pin-card"><h2>'+esc(device.venue_name)+'</h2><p>'+esc(label(device.role))+' çalışma alanı</p><form id="ob-staff-unlock-form"><label>6 haneli PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required autocomplete="current-password"></label><button type="submit">PIN ile giriş yap</button></form><button class="ob-pin-secondary" type="button" data-ob-staff-reset>Yeni cihaz olarak eşleştir</button><small>5 yanlış PIN sonrası 15 dakika kilit.</small></div>');
}
function ready(){
 wrap('<div class="ob-staff-pin-card"><h2>'+esc(device.venue_name)+'</h2><p>'+esc(label(device.role))+' çalışma alanı hazır.</p><button type="button" data-ob-staff-open>Çalışma ekranını aç</button><button type="button" data-ob-staff-lock class="ob-pin-secondary">Oturumu kilitle</button><p>8 saat sonra PIN tekrar istenir.</p></div>');
}
async function show(){
 if(!activeRoute()||pending)return;
 pending=true;wrap('<p>Personel cihazı kontrol ediliyor…</p>');
 try{
  if(!db)throw Error('Supabase bağlantı ayarı bulunamadı.');
  const {data,error}=await db.auth.getSession();if(error)throw error;
  if(!data.session){device=null;pairForm();return}
  device=await rpc('ob_staff_device_status');
  if(!device?.paired){pairForm();return}
  if(!device.active){wrap('<div class="ob-staff-pin-card"><h2>Cihaz erişimi kapalı</h2><p>Yöneticiniz cihazı veya işletme PIN özelliğini kapatmış.</p><button type="button" data-ob-staff-reset>Yeni kodla yeniden eşleştir</button></div>');return}
  if(!device.unlocked){unlockForm();return}
  ready();
 }catch(e){wrap('<div class="ob-staff-pin-card"><p>'+esc(e.message)+'</p><button type="button" data-ob-staff-retry>Tekrar dene</button></div>')}
 finally{pending=false}
}
async function openWorkspace(){if(device?.unlocked&&device.active)await window.OynaBakAdisyonModule?.open(device.venue_id)}
async function pair(form){
 const vals=new FormData(form),code=String(vals.get('code')||'').trim().toUpperCase(),pin=String(vals.get('pin')||'');
 if(!/^[A-F0-9]{24}$/.test(code)||!/^[0-9]{6}$/.test(pin))throw Error('24 karakterlik kod ve 6 haneli PIN gerekli');
 let {data,error}=await db.auth.getSession();if(error)throw error;
 if(!data.session){
  const signed=await db.auth.signInAnonymously();
  if(signed.error){if(/anonymous|disabled|not allowed/i.test(signed.error.message||''))throw Error('Supabase → Authentication → Providers → Anonymous Sign-Ins seçeneğini etkinleştirin.');throw signed.error}
  data=signed.data;
 }
 if(!data?.session?.user?.is_anonymous)throw Error('Bu tarayıcıda personel dışı oturum var. Cihazı sıfırlayın.');
 const result=await rpc('ob_staff_device_pair',{p_code:code,p_pin:pin});
 if(!result?.paired)throw Error('Cihaz eşleştirilemedi');
 await show();await openWorkspace();
}
async function unlock(form){
 const pin=String(new FormData(form).get('pin')||'');
 const result=await rpc('ob_staff_device_unlock',{p_pin:pin});
 if(!result?.ok){notice(result?.message||'PIN hatalı');return}
 await show();await openWorkspace();
}
async function reset(){
 if(!confirm('Bu cihazdaki personel oturumu kaldırılsın mı? Yeniden eşleştirme kodu gerekir.'))return;
 window.OynaBakAdisyonModule?.close();await db.auth.signOut();device=null;await show();
}
document.addEventListener('submit',async e=>{
 if(!activeRoute()||!['ob-staff-pair-form','ob-staff-unlock-form'].includes(e.target.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 const form=e.target,btn=form.querySelector('button[type=submit]');btn.disabled=true;
 try{if(form.id==='ob-staff-pair-form')await pair(form);else await unlock(form)}
 catch(err){notice(err.message)}
 finally{if(btn.isConnected)btn.disabled=false}
},true);
document.addEventListener('click',async e=>{
 if(!activeRoute())return;
 const b=e.target.closest?.('[data-ob-staff-open],[data-ob-staff-lock],[data-ob-staff-reset],[data-ob-staff-retry]');
 if(!b)return;e.preventDefault();e.stopImmediatePropagation();b.disabled=true;
 try{
  if(b.hasAttribute('data-ob-staff-open'))await openWorkspace();
  else if(b.hasAttribute('data-ob-staff-lock')){await rpc('ob_staff_device_lock');window.OynaBakAdisyonModule?.close();device=null;await show()}
  else if(b.hasAttribute('data-ob-staff-reset'))await reset();
  else await show();
 }catch(err){notice(err.message)}
 finally{if(b.isConnected)b.disabled=false}
},true);
window.OynaBakStaffPin=Object.freeze({show,context});
})();