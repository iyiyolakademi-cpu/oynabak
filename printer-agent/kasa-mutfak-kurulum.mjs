#!/usr/bin/env node
// OynaBak cashier+kitchen single-PC installer - free official Node LTS runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface,emitKeypressEvents} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {lanIP} from './print-agent.mjs';
const HOME=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OynaBak');
const CFG=path.join(HOME,'dual-printers.json');
const DEST=path.join(HOME,'dual-agent.mjs');
const SHARED=path.join(HOME,'print-agent.mjs');
const STARTUP=path.join(process.env.APPDATA||'','Microsoft','Windows','Start Menu','Programs','Startup','OynaBak-Kasa-Mutfak.cmd');
const ui=createInterface({input:process.stdin,output:process.stdout});
const ask=q=>new Promise(resolve=>ui.question(q,s=>resolve(s.trim())));
const quote=s=>'"'+String(s).replaceAll('"','')+'"';
function sid(){
 const str=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
 const match=str.match(/S-1-\d+(?:-\d+)+/);
 if(!match)throw Error('Windows kullanıcı kimliği bulunamadı');
 return match[0];
}
function lock(file){
 execFileSync('icacls.exe',[file,'/inheritance:r','/grant:r','*'+sid()+':(F)'],{windowsHide:true,stdio:'pipe'});
}
function ipPrefixes(){
 const prefixes=new Set();
 for(const group of Object.values(os.networkInterfaces()))for(const a of group||[]){
  if(a.family==='IPv4'&&!a.internal&&lanIP(a.address))
   prefixes.add(a.address.split('.').slice(0,3).join('.')+'.');
 }
 return [...prefixes].slice(0,2);
}
async function available(ip,port=9100,timeout=500){
 return new Promise(done=>{
  let ended=false;const s=net.createConnection({host:ip,port});
  const stop=ok=>{if(ended)return;ended=true;s.destroy();done(ok)};
  s.setTimeout(timeout,()=>stop(false));
  s.once('error',()=>stop(false));s.once('connect',()=>stop(true));
 });
}
async function scan(){
 const addresses=ipPrefixes().flatMap(p=>Array.from({length:254},(_,i)=>p+(i+1)));
 let ix=0;const result=[];
 await Promise.all(Array.from({length:32},async()=>{
  while(ix<addresses.length){
   const ip=addresses[ix++];
   if(await available(ip))result.push(ip);
  }
 }));
 return result.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
async function enterToken(){
 process.stdout.write('Cihaz anahtarını yapıştırıp ENTER: ');
 if(!process.stdin.isTTY)return ask('');
 ui.pause();emitKeypressEvents(process.stdin);const old=process.stdin.isRaw;
 let value='',notify=null;
 const queue=[];
 const listener=(s,key)=>{queue.push({s,key});if(notify){notify();notify=null}};
 process.stdin.on('keypress',listener);
 process.stdin.setRawMode(true);process.stdin.resume();
 try{
  for(;;){
   if(!queue.length)await new Promise(r=>notify=r);
   const {s,key}=queue.shift();
   if(key?.ctrl && key?.name==='c')throw Error('Kurulum iptal edildi');
   if(key?.name==='return'||key?.name==='enter')break;
   if(key?.name==='backspace')value=value.slice(0,-1);
   else if(s && !/[\x00-\x1f\x7f]/.test(s))value+=s;
  }
 }finally{
  process.stdin.off('keypress',listener);
  process.stdin.setRawMode(old??false);ui.resume();process.stdout.write('\n');
 }
 return value.trim();
}
function save(c){
 fs.mkdirSync(HOME,{recursive:true});
 const temp=CFG+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(c,null,2),'utf8');
 lock(temp);
 fs.renameSync(temp,CFG);
 lock(CFG);
 fs.copyFileSync(fileURLToPath(new URL('./dual-agent.mjs',import.meta.url)),DEST);
 fs.copyFileSync(fileURLToPath(new URL('./print-agent.mjs',import.meta.url)),SHARED);
 lock(DEST);lock(SHARED);
 fs.mkdirSync(path.dirname(STARTUP),{recursive:true});
 fs.writeFileSync(STARTUP,'@echo off\r\nstart "" /min '+quote(process.execPath)+' '+quote(DEST)+' --live\r\n','utf8');
 lock(STARTUP);
}
async function test(c){
 const child=spawn(process.execPath,[DEST,'--test-printer'],{stdio:'inherit'});
 return await new Promise(resolve=>{
  child.once('error',()=>resolve(false));
  child.once('exit',code=>resolve(code===0));
 });
}
function launch(){
 const log=fs.openSync(path.join(HOME,'dual-printer.log'),'a');
 const child=spawn(process.execPath,[DEST,'--live'],
  {cwd:HOME,detached:true,windowsHide:true,stdio:['ignore',log,log]});
 child.unref();fs.closeSync(log);
}
async function main(){
 if(process.platform!=='win32')throw Error('Yalnızca Windows 10/11 desteklenir.');
 if(+process.versions.node.split('.')[0]<20)throw Error('Node.js 20+ LTS gerekiyor.');
 if(process.argv.includes('--check')){
  fs.accessSync(new URL('./dual-agent.mjs',import.meta.url));
  fs.accessSync(new URL('./print-agent.mjs',import.meta.url));
  console.log('Kasa ve mutfak kurulum paketleri hazır.');return;
 }
 console.log('\n================ OYNABAK OTOMATİK 2 YAZICI =================\n');
 console.log('Kasadaki Windows bilgisayarı ve iki yazıcı aynı yerel ağda olmalıdır.');
 console.log('1) https://oynabak.com/printer-admin.html > Cihaz Eşleştir');
 console.log('2) Cihaz anahtarını kopyala, aşağıya yapıştır. Anahtar ekranda gizlidir.\n');
 const token=await enterToken();
 if(!/^obp_[a-f0-9]{64}$/.test(token))throw Error('Cihaz anahtarı geçersiz, panelden yeniden kopyalayın.');
 console.log('\nAğda 9100 portuyla çalışan cihazlar aranıyor...');
 const found=await scan();
 if(!found.length)console.log('Yazıcı otomatik bulunamadı; IP adreslerini elle girebilirsiniz.');
 found.forEach((ip,i)=>console.log('  '+(i+1)+') '+ip));
 async function choose(which){
  const answer=await ask(which+' yazıcı numarası veya IP adresi: ');
  const host=/^\d+$/.test(answer)&&+answer>0&&+answer<=found.length
   ?found[+answer-1]:answer;
  if(!lanIP(host))throw Error(which+' için geçerli yerel IPv4 adresi girilmeli.');
  if(!await available(host,9100,3500))throw Error(which+' yazıcısı bulunamadı. Ethernet/IP/9100 kontrol edin.');
  return {host,port:9100,width:paperWidth};
 }
 const paperInput=(await ask('Kağıt genişliği (her iki yazıcı için 80 veya 58, varsayılan 80): '))||'80';
 if(!['80','58'].includes(paperInput))throw Error('Kağıt genişliği 80 veya 58 olmalı.');
 const paperWidth=Number(paperInput);
 console.log('OynaBak yönetici panelindeki kağıt genişliğini de '+paperWidth+' mm ayarlayın.');
 const kitchen=await choose('MUTFAK');
 const cashier=await choose('KASA');
 if(kitchen.host===cashier.host)
  throw Error('Mutfak ve kasa iki farklı fiziksel yazıcı olmalı (IP adresleri farklı).');
 const cfg={device_token:token,printers:{kitchen,cashier}};
 save(cfg);
 console.log('\nKurulum dosyaları kaydedildi. İki gerçek yazıcıya test fişleri gönderilecek.');
 const ok=await test(cfg);
 if(!ok)throw Error('İki yazıcıdan biri testte hata verdi. Otomatik baskıyı ETKİNLEŞTİRMEYİN.');
 const physical=(await ask('HEM KASA HEM MUTFAK fişi fiziksel çıktı ve Türkçe harfler doğru mu? (EVET/H): ')).toLocaleUpperCase('tr-TR');
 if(physical!=='EVET')throw Error('Fiziksel iki yazıcı testi onaylanmadı. Baskı henüz açılmamalı.');
 // Clear only OynaBak's own old startup commands to avoid a legacy agent running.
 const oldStartup=path.join(process.env.APPDATA||'','Microsoft','Windows','Start Menu','Programs','Startup','OynaBak-Yazici.cmd');
 try{if(fs.existsSync(oldStartup))fs.unlinkSync(oldStartup)}catch{}
 try{execFileSync('reg.exe',['delete','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  '/v','OynaBak Yazici','/f'],{windowsHide:true,stdio:'ignore'})}catch{}
 launch();
 console.log('\nBAĞLANTI HAZIR: iki yazıcı otomatik sipariş kuyruğunu takip ediyor.');
 console.log('SON ADIM: https://oynabak.com/printer-admin.html');
 console.log('“Kasa + Mutfak (2 yazıcı)” ve otomatik yazdırmayı fiziksel test sonrası etkinleştirin.');
 console.log('Bu bilgisayarda daha önce çalışan OynaBak EXE varsa tamamen ÇIKIŞ yapın.');
 console.log('Windows kullanıcı oturumu açık kalmalı, bilgisayar uykuya geçmemeli.');
}
main().catch(err=>{console.error('\nKURULUM TAMAMLANAMADI: '+err.message);process.exitCode=1})
 .finally(()=>ui.close());
