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
const configPath=()=>process.env.OYNABAK_PRINTER_CONFIG||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OynaBak','printer.json');
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
export function receipt(payload,width=80,station='all',displayStation=station){
 if(![58,80].includes(width)||!Array.isArray(payload?.items))throw Error('Fiş verisi geçersiz');
 if(!['all','kitchen','bar','cashier'].includes(station))throw Error('Bölüm geçersiz');
 const cols=width===58?30:42;
 const items=payload.items.filter(x=>station==='all'||station==='cashier'||x.station===station);
 if(!items.length)throw Error('Bu istasyona ait ürün yok');
 const out=[],cmd=(...n)=>out.push(Buffer.from(n));
 const put=text=>out.push(encodeCP857(String(text)+'\n'));
 const line=text=>put(safeText(text,cols));
 const lines=(text,max=600)=>wrap(safeText(text,max),cols).forEach(put);
 const center=()=>cmd(27,97,1),left=()=>cmd(27,97,0);
 const bold=yes=>cmd(27,69,yes?1:0);
 const rule=()=>line('-'.repeat(cols));
 const label=displayStation==='kitchen'?'MUTFAK SİPARİŞİ':
  displayStation==='cashier'?'KASA SİPARİŞİ':
  displayStation==='bar'?'BAR SİPARİŞİ':'YENİ SİPARİŞ';
 const table=safeText(payload.table_no,12);
 if(!table)throw Error('Masa numarası boş');
 const submitted=payload.submitted_at||payload.created_at;
 const parsed=submitted?new Date(submitted):new Date();
 const stamp=Number.isNaN(parsed.getTime())?new Date():parsed;
 const datetime=new Intl.DateTimeFormat('tr-TR',{
  timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',hour12:false
 }).format(stamp);
 // ESC/POS: initialize; CP857 Turkish; native bold; 2x table title; paper cut.
 cmd(27,64);cmd(27,116,29);
 cmd(27,100,1);center();bold(true);line('OYNABAK');bold(false);
 line(label);rule();
 // Large but bounded table number. 2x width leaves half the normal columns.
 const tableTitle='MASA '+table;
 if(tableTitle.length<=Math.floor(cols/2)){
  cmd(29,33,0x11);bold(true);line(tableTitle);bold(false);cmd(29,33,0x00);
 }else{
  bold(true);line(tableTitle);bold(false);
 }
 rule();left();bold(true);
 for(const item of items){
  const qty=Number(item.quantity);
  const name=safeText(item.name,240);
  if(!Number.isInteger(qty)||qty<1||qty>999||!name)throw Error('Ürün geçersiz');
  lines(qty+' x '+name);
  bold(false);
  if(item.variant_name)lines('  '+safeText(item.variant_name,200));
  if(item.note)lines('  NOT: '+safeText(item.note,300));
  bold(true);
 }
 bold(false);
 if(payload.customer_note&&safeText(payload.customer_note,400)){
  rule();bold(true);line('SİPARİŞ NOTU');bold(false);
  lines(payload.customer_note,400);
 }
 rule();center();line(datetime);line('OYNABAK · QR SİPARİŞ'.replace(' · ',' - '));
 cmd(27,100,4);cmd(29,86,0);
 return Buffer.concat(out);
}

export function lanIP(ip){
 if(isIP(ip)!==4)return false;
 const n=ip.split('.').map(Number);
 return n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)||(n[0]===169&&n[1]===254);
}
function cfg(){
 const c=JSON.parse(fs.readFileSync(configPath(),'utf8').replace(/^\uFEFF/,''));
 if(!/^obp_[a-f0-9]{64}$/.test(c.device_token))throw Error('Cihaz anahtarı eksik');
 if(!lanIP(c.printer_host))throw Error('Yazıcı yerel ağ IPv4 adresi olmalı');
 if(!Number.isInteger(c.printer_port)||c.printer_port<1||c.printer_port>65535)throw Error('Port geçersiz');
 if(![58,80].includes(c.paper_width_mm))throw Error('Kağıt ölçüsü hatalı');
 return c;
}
async function rpc(name,payload){
 const res=await fetch(API+'/rest/v1/rpc/'+name,{
  method:'POST',signal:AbortSignal.timeout(15000),
  headers:{apikey:KEY,'Content-Type':'application/json'},
  body:JSON.stringify(payload)});
 const result=await res.json().catch(()=>null);
 if(!res.ok)throw Error('Sunucu HTTP '+res.status+': '+safeText(JSON.stringify(result),140));
 return result;
}
export function decodePrinterStatus(bytes){
 if(!bytes||bytes.length<3)throw Error('Yazıcı durum yanıtı eksik');
 const [offline,errors,paper]=bytes;
 if((offline&0x04)!==0)throw Error('Yazıcının kapağı açık');
 if((offline&0x40)!==0)throw Error('Yazıcı çevrimdışı veya arızalı');
 if((errors&0x68)!==0)throw Error('Kesici veya yazıcı donanımı arızalı');
 if((paper&0x60)!==0)throw Error('Yazıcıda kâğıt yok');
 return true;
}
async function checkPrinterStatus(c){
 // Rongta 80 Series DLE EOT 2/3/4; fail closed if device does not reply.
 await new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:c.printer_host,port:c.printer_port});
  let done=false;let received=Buffer.alloc(0);
  const finish=err=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();err?reject(err):resolve()};
  const timer=setTimeout(()=>finish(new Error('Yazıcı sensör durumunu bildirmedi')),4000);
  socket.once('error',finish);
  socket.once('connect',()=>socket.write(Buffer.from([16,4,2,16,4,3,16,4,4])));
  socket.on('data',part=>{
   received=Buffer.concat([received,part]);
   if(received.length>=3){
    try{decodePrinterStatus(received.subarray(0,3));finish()}
    catch(e){finish(e)}
   }
  });
  socket.once('close',()=>{if(!done)finish(new Error('Yazıcı durum bağlantısı kesildi'))});
 });
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
 if(process.argv.includes('--test-printer')){
  const c=cfg();
  await checkPrinterStatus(c);
  const bytes=receipt({...sample,customer_note:'TÜRKÇE KARAKTER: Ç Ğ İ Ö Ş Ü ç ğ ı ö ş ü'},c.paper_width_mm);
  await tcpWrite(c,bytes);
  console.log('Test fişi yazıcıya iletildi. Fiziksel kâğıdı ve Türkçe harfleri kontrol edin.');
  return;
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
    let sent=false;
    try{
     if(job.paper_width_mm!==c.paper_width_mm)throw Error('Kağıt ölçüsü farklı');
     const bytes=receipt(job.payload,c.paper_width_mm,job.station);
     await checkPrinterStatus(c);
     // Network failure during transfer makes physical output uncertain.
     // Mark ambiguous BEFORE starting TCP writes; never retry automatically.
     sent=true;
     await tcpWrite(c,bytes);
     const ok=await rpc('ob_print_finish',{p_token:c.device_token,p_job_id:job.id,p_claim_id:job.claim_id,p_outcome:'printed',p_error:''});
     if(ok)console.log('Fiş yazıcıya gönderildi:',job.id);
     else console.error('Gönderildi ancak sunucu onayı belirsiz:',job.id);
    }catch(e){
     console.error('Baskı belirsiz veya hatalı, otomatik tekrar yok:',job.id,safeText(e.message,100));
     // Never mark a possibly printed order as failed: leave printing for manual review.
     if(sent){console.error('Baskı gönderildi; sonuç belirsiz. Yönetici kontrol etmeli.');continue}
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
