#!/usr/bin/env node
// OynaBak scoped-device LAN ESC/POS agent; Node >=20; no admin credentials.
import fs from 'node:fs';
import net,{isIP} from 'node:net';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const API='https://qacmubkcierbpxmdtsph.supabase.co';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const configPath=()=>process.env.OYNABAK_PRINTER_CONFIG||path.join(os.homedir(),'AppData','Local','OynaBak','printer.json');
const sample={table_no:8,customer_note:'Soğansız, az tuzlu',items:[{name:'İskender ve çiğ köfte',quantity:2,note:'Şekersiz çay',station:'kitchen'},{name:'Sütlü Türk kahvesi',quantity:1,station:'bar'}]};
const cp857={'Ç':128,'ç':135,'Ğ':166,'ğ':167,'İ':152,'ı':141,'Ö':153,'ö':148,'Ş':158,'ş':159,'Ü':154,'ü':129};
const latinExtras={'é':130,'â':131,'ä':132,'à':133,'å':134,'ê':136,'ë':137,'è':138,'ï':139,'î':140,'Ä':142,'Å':143,'É':144,'æ':145,'Æ':146,'ô':147,'ò':149,'û':150,'ù':151,'á':160,'í':161,'ó':162,'ú':163,'ñ':164,'Ñ':165};
const safeText=(s,n=160)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
export function encodeCP857(s){
 const bytes=[];
 for(const ch of String(s)){
  if(ch==='\n'){bytes.push(10);continue}
  const cp=ch.codePointAt(0);
  if(cp>=32&&cp<=126)bytes.push(cp);
  else if(Object.hasOwn(cp857,ch))bytes.push(cp857[ch]);
  else if(Object.hasOwn(latinExtras,ch))bytes.push(latinExtras[ch]);
  else bytes.push(63); // explicit '?' for unsupported glyphs
 }
 return Buffer.from(bytes);
}
function wrap(s,cols){
 const text=safeText(s,600);
 const lines=[];
 for(let i=0;i<text.length;i+=cols)lines.push(text.slice(i,i+cols));
 return lines.length?lines:[''];
}
export function receipt(payload,width=80,station='all'){
 if(![58,80].includes(width)||!Array.isArray(payload?.items))throw Error('Fiş verisi geçersiz');
 const cols=width===58?30:42;
 const items=payload.items.filter(x=>station==='all'||station==='cashier'||x.station===station);
 if(!items.length)throw Error('Bu istasyona ait ürün yok');
 const out=[],cmd=(...n)=>out.push(Buffer.from(n));
 const line=text=>out.push(encodeCP857(safeText(text,cols)+'\n'));
 cmd(27,64);cmd(27,116,29); // RP330/Rongta page 29 = CP857 Turkish (verify per device)
 cmd(27,97,1);cmd(27,69,1);line('OYNABAK');cmd(27,69,0);line('SİPARİŞ FİŞİ');
 cmd(27,97,0);line('-'.repeat(cols));line('MASA '+safeText(payload.table_no,6));
 line('BÖLÜM '+station.toLocaleUpperCase('tr-TR'));line('-'.repeat(cols));
 for(const it of items){
  const qty=Number(it.quantity);
  if(!Number.isInteger(qty)||qty<1||qty>999||!safeText(it.name))throw Error('Ürün geçersiz');
  for(const s of wrap(qty+' x '+it.name,cols))line(s);
  if(it.variant_name)for(const s of wrap('  '+it.variant_name,cols))line(s);
  if(it.note)for(const s of wrap('  NOT: '+it.note,cols))line(s);
 }
 if(payload.customer_note){line('-'.repeat(cols));for(const s of wrap('NOT: '+payload.customer_note,cols))line(s)}
 line('-'.repeat(cols));line('HAZIRLANACAK SİPARİŞ');cmd(27,100,4);cmd(29,86,0);
 return Buffer.concat(out);
}
export function lanIP(ip){
 if(isIP(ip)!==4)return false;
 const n=ip.split('.').map(Number);
 return n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)||(n[0]===169&&n[1]===254);
}
function cfg(){
 const c=JSON.parse(fs.readFileSync(configPath(),'utf8'));
 if(!/^obp_[a-f0-9]{64}$/.test(c.device_token))throw Error('Cihaz anahtarı eksik');
 if(!lanIP(c.printer_host))throw Error('Yazıcı yerel ağ IPv4 adresi olmalı');
 if(!Number.isInteger(c.printer_port)||c.printer_port<1||c.printer_port>65535)throw Error('Port geçersiz');
 if(![58,80].includes(c.paper_width_mm))throw Error('Kağıt ölçüsü hatalı');
 return c;
}
async function rpc(name,payload){
 const res=await fetch(API+'/rest/v1/rpc/'+name,{
  method:'POST',signal:AbortSignal.timeout(15000),
  headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},
  body:JSON.stringify(payload)});
 const result=await res.json().catch(()=>null);
 if(!res.ok)throw Error('Sunucu HTTP '+res.status+': '+safeText(JSON.stringify(result),140));
 return result;
}
async function tcpWrite(c,bytes){
 await new Promise((resolve,reject)=>{
  let finished=false;
  const socket=net.createConnection({host:c.printer_host,port:c.printer_port});
  const end=err=>{if(finished)return;finished=true;clearTimeout(timeout);err?reject(err):resolve()};
  const timeout=setTimeout(()=>socket.destroy(new Error('Yazıcı yanıt vermedi')),12000);
  socket.once('error',end);
  socket.once('connect',()=>socket.end(bytes));
  socket.once('close',bad=>end(bad?Error('Yazıcı bağlantısı kapandı'):undefined));
 });
}
async function run(){
 if(process.argv.includes('--sample')){
  const bytes=receipt(sample,80);
  console.log('Örnek fiş oluşturuldu, bayt:',bytes.length,'Türkçe kod sayfası: CP857 (29)');
  console.log('Önizleme:',sample);return;
 }
 if(!process.argv.includes('--live')){
  console.log('Yazıcı çalıştırılmadı. Örnek: node print-agent.mjs --sample');return;
 }
 const c=cfg();
 console.log('OynaBak cihaz yazdırma servisi başladı. Yerel yazıcı:',c.printer_host);
 while(true){
  try{
   // The server enforces venue scope and enabled settings. No founder password.
   const job=await rpc('ob_print_claim',{p_token:c.device_token});
   if(job){
    try{
     if(job.paper_width_mm!==c.paper_width_mm)throw Error('Kağıt ölçüsü farklı');
     const bytes=receipt(job.payload,c.paper_width_mm,job.station);
     await tcpWrite(c,bytes);
     const ok=await rpc('ob_print_finish',{p_token:c.device_token,p_job_id:job.id,p_claim_id:job.claim_id,p_outcome:'printed',p_error:''});
     if(ok)console.log('Fiş yazıcıya gönderildi:',job.id);
     else console.error('Gönderildi ancak sunucu onayı belirsiz:',job.id);
    }catch(e){
     console.error('Baskı belirsiz veya hatalı, otomatik tekrar yok:',job.id,safeText(e.message,100));
     // If the network is down this call may fail; job stays "printing" for manual review.
     try{await rpc('ob_print_finish',{p_token:c.device_token,p_job_id:job.id,p_claim_id:job.claim_id,p_outcome:'failed',p_error:safeText(e.message,180)})}catch(err){console.error('Durum kaydedilemedi, yönetici incelemeli.')}
    }
   }
  }catch(e){console.error('İnternet/sunucu bağlantısı:',safeText(e.message,140))}
  await sleep(4000);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 run().catch(e=>{console.error(e.message);process.exitCode=1});
}
