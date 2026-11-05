#!/usr/bin/env node
// OynaBak LAN ESC/POS bridge. Node >=20. No service role key.
import fs from 'node:fs';
import net, {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';

const API='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const escapeTr={'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'};
const clean=(s,n=100)=>String(s??'').replace(/[çÇğĞıİöÖşŞüÜ]/g,ch=>escapeTr[ch]).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function receipt(payload,width=80,station='all'){
  if(![58,80].includes(width)||!Array.isArray(payload?.items))throw Error('Gecersiz fis verisi');
  const cols=width===58?30:42;
  const items=payload.items.filter(x=>station==='all'||station==='cashier'||clean(x.station,20)===station);
  if(!items.length)throw Error('Bu bolumde urun yok');
  const parts=[];
  const cmd=(...n)=>parts.push(Buffer.from(n));
  const row=s=>parts.push(Buffer.from(clean(s,cols)+'\n','ascii'));
  cmd(27,64);cmd(27,97,1);cmd(27,69,1);row('OYNABAK');cmd(27,69,0);row('SIPARIS FISI');
  cmd(27,97,0);row('-'.repeat(cols));row('MASA '+clean(payload.table_no,6));
  row('BOLUM: '+clean(station.toUpperCase(),12));row('-'.repeat(cols));
  for(const item of items){
    const q=Number(item.quantity),name=clean(item.name,120);
    if(!Number.isInteger(q)||q<1||q>999||!name)throw Error('Gecersiz urun');
    const prefix=q+' x ';
    row(prefix+name.slice(0,cols-prefix.length));
    for(let remaining=name.slice(cols-prefix.length);remaining;remaining=remaining.slice(cols-2))row('  '+remaining.slice(0,cols-2));
    if(item.variant_name)row('  '+clean(item.variant_name,cols-2));
    if(item.note)row('  NOT: '+clean(item.note,cols-7));
  }
  if(payload.customer_note){row('-'.repeat(cols));row('NOT: '+clean(payload.customer_note,cols-5))}
  row('-'.repeat(cols));row('HAZIRLANACAK SIPARIS');
  cmd(27,100,4);cmd(29,86,0);
  return Buffer.concat(parts);
}
export function isLanIp(ip){
  if(isIP(ip)!==4)return false;const a=ip.split('.').map(Number);
  return a[0]===10||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===169&&a[1]===254);
}
function loadConfig(){
  const filename=process.env.OYNABAK_PRINTER_CONFIG||new URL('./config.local.json',import.meta.url);
  const c=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(c.venue_id))throw Error('venue_id UUID olmali');
  if(!isLanIp(c.printer_host))throw Error('Yazici adresi yerel ag IPv4 olmali');
  if(!Number.isInteger(c.printer_port)||c.printer_port<1||c.printer_port>65535)throw Error('Port gecersiz');
  if(![58,80].includes(c.paper_width_mm))throw Error('Kagit genisligi gecersiz');
  return c;
}
async function api(path,token,method='GET',body){
  const r=await fetch(API+path,{method,signal:AbortSignal.timeout(12000),
    headers:{apikey:KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),Prefer:'return=representation'},
    body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Error('Sunucu HTTP '+r.status+' '+clean(JSON.stringify(data),160));
  return data;
}
async function login(){
  const email=process.env.OYNABAK_ADMIN_EMAIL,password=process.env.OYNABAK_ADMIN_PASSWORD;
  if(!email||!password)throw Error('Yonetici e-posta ve sifresi ortam degiskeninde olmali');
  const session=await api('/auth/v1/token?grant_type=password',null,'POST',{email,password});
  if(!session?.access_token)throw Error('Oturum acilamadi');
  const me=await api('/rest/v1/rpc/ob_me',session.access_token,'POST',{});
  if(me?.role!=='admin')throw Error('Yalnizca kurucu yonetici oturumu kabul edilir');
  return session.access_token;
}
async function print(c,bytes){
  await new Promise((resolve,reject)=>{
    let done=false;
    const socket=net.createConnection({host:c.printer_host,port:c.printer_port});
    const finish=err=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve()};
    const timer=setTimeout(()=>socket.destroy(Error('Zaman asimi')),12000);
    socket.once('error',finish);
    socket.once('connect',()=>socket.end(bytes));
    socket.once('close',bad=>{if(!bad)finish();else finish(Error('Baglanti kesildi'))});
  });
}
async function run(){
  if(process.argv.includes('--sample')){
    const x=receipt({table_no:8,customer_note:'Az tuzlu',items:[{name:'Hamburger',quantity:2,note:'Sogansiz',station:'kitchen'},{name:'Ayran',quantity:1,station:'bar'}]},80);
    console.log(x.toString('ascii').replace(/[\x00-\x09\x0b-\x1f]/g,''));return;
  }
  if(!process.argv.includes('--live')||process.env.ENABLE_LOCAL_PRINTING!=='YES'){
    console.log('Guvenli mod: --sample veya --live + ENABLE_LOCAL_PRINTING=YES');return;
  }
  const cfg=loadConfig();let token=await login(),tokenAt=Date.now();
  console.log('OynaBak yerel yazdirma ajanı basladi',cfg.venue_id,cfg.printer_host);
  while(true){
    try{
      if(Date.now()-tokenAt>40*60*1000){token=await login();tokenAt=Date.now()}
      const settings=(await api('/rest/v1/ob_printer_settings?select=enabled,auto_print,connection_type,paper_width_mm,station&venue_id=eq.'+encodeURIComponent(cfg.venue_id),token))?.[0];
      if(!settings?.enabled||!settings?.auto_print||settings.connection_type!=='ethernet'||settings.paper_width_mm!==cfg.paper_width_mm){
        await sleep(4000);continue;
      }
      const jobs=await api('/rest/v1/ob_print_jobs?select=id,venue_id,payload,attempts,station,paper_width_mm&status=eq.pending&venue_id=eq.'+encodeURIComponent(cfg.venue_id)+'&order=created_at.asc&limit=5',token);
      for(const job of jobs||[]){
        if(job.station!==settings.station||job.paper_width_mm!==cfg.paper_width_mm)continue;
        // Conditional PATCH claims once even when two agents poll concurrently.
        const claimed=await api('/rest/v1/ob_print_jobs?id=eq.'+encodeURIComponent(job.id)+'&status=eq.pending',token,'PATCH',{
          status:'printing',attempts:job.attempts+1,updated_at:new Date().toISOString()
        });
        if(!claimed?.length)continue;
        try{
          const bytes=receipt(job.payload,cfg.paper_width_mm,job.station);
          await print(cfg,bytes);
          await api('/rest/v1/ob_print_jobs?id=eq.'+encodeURIComponent(job.id)+'&status=eq.printing',token,'PATCH',{
            status:'printed',printed_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null
          });
          console.log('Yaziciya iletildi:',job.id);
        }catch(e){
          await api('/rest/v1/ob_print_jobs?id=eq.'+encodeURIComponent(job.id)+'&status=eq.printing',token,'PATCH',{
            status:'failed',last_error:clean(e.message,200),updated_at:new Date().toISOString()
          });
          console.error('Fis hatasi:',job.id,clean(e.message,100));
        }
      }
    }catch(e){console.error('Kuyruk kontrolu:',clean(e.message,180));try{token=await login();tokenAt=Date.now()}catch{}}
    await sleep(4000);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(clean(e.message,180));process.exitCode=1});
