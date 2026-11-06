#!/usr/bin/env node
// OynaBak 2-printer unattended Ethernet spooler.
// Official Node.js LTS; no custom unsigned executable, no founder password.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {receipt,decodePrinterStatus,lanIP} from './print-agent.mjs';

const API='https://qacmubkcierbpxmdtsph.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
const filename=process.env.OYNABAK_DUAL_CONFIG||
 path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OynaBak','dual-printers.json');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safe=s=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,175);
const stations=['kitchen','cashier'];

export function validateConfig(c){
 if(!c||!/^obp_[0-9a-f]{64}$/.test(c.device_token))throw Error('Geçerli cihaz anahtarı bulunamadı');
 if(!c.printers||typeof c.printers!=='object')throw Error('Kasa ve mutfak adresleri eksik');
 for(const station of stations){
  const p=c.printers[station];
  if(!p||!lanIP(p.host))throw Error(station+' yerel IPv4 yazıcı adresi geçersiz');
  if(!Number.isInteger(p.port)||p.port<1||p.port>65535)throw Error(station+' portu geçersiz');
  if(![58,80].includes(p.width))throw Error(station+' kâğıt ölçüsü geçersiz');
 }
 if(c.printers.kitchen.host===c.printers.cashier.host &&
    c.printers.kitchen.port===c.printers.cashier.port)
    throw Error('Kasa ve mutfak aynı fiziksel yazıcı adresine bağlanamaz');
 return c;
}

async function rpc(fn,params){
 const r=await fetch(API+fn,{method:'POST',signal:AbortSignal.timeout(15000),
 headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(params)});
 const payload=await r.json().catch(()=>null);
 if(!r.ok)throw Error('OynaBak bağlantı hatası '+r.status+': '+safe(JSON.stringify(payload)));
 return payload;
}

// Status response verified before any print data. Some firmware does not implement
// DLE/EOT over Ethernet; fail closed instead of printing blindly.
export async function statusCheck(p){
 return new Promise((resolve,reject)=>{
  const sock=net.createConnection({host:p.host,port:p.port});
  let finished=false,buff=Buffer.alloc(0);
  const timer=setTimeout(()=>finish(new Error('Yazıcı sensör bilgisi gelmedi')),5000);
  const finish=e=>{if(finished)return;finished=true;clearTimeout(timer);sock.destroy();e?reject(e):resolve()};
  sock.once('error',finish);
  sock.once('connect',()=>sock.write(Buffer.from([16,4,2,16,4,3,16,4,4])));
  sock.on('data',data=>{
   buff=Buffer.concat([buff,data]);
   if(buff.length>=3){
    try{decodePrinterStatus(buff.subarray(0,3));finish()}
    catch(e){finish(e)}
   }
  });
  sock.once('close',()=>{if(!finished)finish(new Error('Yazıcı bağlantısı kapandı'))});
 });
}

export async function send(p,bytes){
 return new Promise((resolve,reject)=>{
  const sock=net.createConnection({host:p.host,port:p.port});
  let finished=false;
  const timer=setTimeout(()=>done(new Error('Yazıcı aktarımında zaman aşımı')),12000);
  const done=e=>{if(finished)return;finished=true;clearTimeout(timer);sock.destroy();e?reject(e):resolve()};
  sock.once('error',done);
  sock.once('connect',()=>sock.end(bytes));
  sock.once('close',bad=>done(bad?new Error('Yazıcı bağlantısı kesildi'):undefined));
 });
}
function config(){return validateConfig(JSON.parse(fs.readFileSync(filename,'utf8')))}
export async function printTest(c){
 for(const station of stations){
  const p=c.printers[station];
  const bytes=receipt({
   table_no:'TEST', customer_note:'TÜRKÇE: Ç Ğ İ Ö Ş Ü ç ğ ı ö ş ü',
   items:[{name:'TEST - '+(station==='kitchen'?'MUTFAK':'KASA'),quantity:1}]
  },p.width,'all',station);
  await statusCheck(p);
  await send(p,bytes);
  console.log((station==='kitchen'?'MUTFAK':'KASA')+' yazıcısına test fişi gönderildi; kâğıttan çıktığını fiziksel olarak doğrulayın.');
 }
}
async function processOutput(c,station){
 const job=await rpc('ob_dual_print_claim',{p_token:c.device_token,p_station:station});
 if(!job)return;
 const p=c.printers[station];
 let possiblySent=false;
 try{
  if(job.paper_width_mm!==p.width)throw Error('Kâğıt ölçüsü uyuşmuyor: '+station);
  const bytes=receipt(job.payload,p.width,'all',station);
  await statusCheck(p);
  // From this point on, network errors are ambiguous: never auto-reprint.
  possiblySent=true;
  await send(p,bytes);
  const ok=await rpc('ob_dual_print_finish',{
   p_token:c.device_token,p_output_id:job.id,p_claim_id:job.claim_id,
   p_outcome:'printed',p_error:''
  });
  if(!ok)console.error('Sunucu baskı sonucunu doğrulayamadı: '+job.id);
  else console.log('Fiş iletildi:',station,'masa',job.payload?.table_no,job.id);
 }catch(e){
  console.error('Yazıcı hatası:',station,safe(e.message));
  if(!possiblySent){
   try{await rpc('ob_dual_print_finish',{
    p_token:c.device_token,p_output_id:job.id,p_claim_id:job.claim_id,
    p_outcome:'failed',p_error:safe(e.message)
   })}catch(err){console.error('Hata durumu sunucuya yazılamadı:',safe(err.message))}
  }else{
   console.error('Baskı BELİRSİZ: fiziksel kontrol olmadan otomatik tekrar yok.');
  }
 }
}
export async function live(c){
 validateConfig(c);
 console.log('OynaBak otomatik iki yazıcı servisi başladı. Mutfak:',c.printers.kitchen.host,'Kasa:',c.printers.cashier.host);
 while(true){
  try{
   // Two independent station-specific jobs, each claimed atomically in Supabase.
   await processOutput(c,'kitchen');
   await processOutput(c,'cashier');
  }catch(e){console.error('Sunucu bağlantısı:',safe(e.message))}
  await sleep(3500);
 }
}
async function main(){
 const c=config();
 if(process.argv.includes('--test-printer'))return printTest(c);
 if(process.argv.includes('--live'))return live(c);
 console.log('Kullanım: node dual-agent.mjs --test-printer veya --live');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
 main().catch(e=>{console.error('OynaBak:',safe(e.message));process.exitCode=1});
