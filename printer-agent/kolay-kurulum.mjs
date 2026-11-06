#!/usr/bin/env node
// Free OynaBak Windows setup. Requires official, signed Node.js LTS.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface,emitKeypressEvents} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {lanIP} from './print-agent.mjs';
import {configureStartup} from './windows-startup.mjs';

const root=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OynaBak');
const config=path.join(root,'printer.json');
const target=path.join(root,'print-agent.mjs');
const startup=path.join(process.env.APPDATA||'','Microsoft','Windows','Start Menu','Programs','Startup','OynaBak-Yazici.cmd');
const ui=createInterface({input:process.stdin,output:process.stdout});
const ask=question=>new Promise(resolve=>ui.question(question,answer=>resolve(answer.trim())));
const validToken=v=>/^obp_[a-f0-9]{64}$/.test(v);
const quote=v=>'"'+String(v).replaceAll('"','')+'"';

async function readToken(){
 if(!process.stdin.isTTY)return await ask('Cihaz anahtarı: ');
 ui.pause();emitKeypressEvents(process.stdin);
 const old=process.stdin.isRaw;
 process.stdout.write('Cihaz anahtarını yapıştır, sonra ENTER (anahtar gizli): ');
 process.stdin.setRawMode(true);process.stdin.resume();
 let value='';
 try{
  for await(const key of keys()){
   if(key.name==='return'||key.name==='enter')break;
   if(key.ctrl && key.name==='c')throw Error('Kurulum iptal edildi');
   if(key.name==='backspace')value=value.slice(0,-1);
   else if(key.sequence&&key.sequence.length===1&&key.sequence>=' ')value+=key.sequence;
  }
 }finally{process.stdin.setRawMode(old??false);ui.resume();process.stdout.write('\n')}
 return value.trim();
}
async function* keys(){
 const queue=[];let wake;
 const push=(s,k)=>{queue.push({...k,sequence:s});if(wake){wake();wake=null}};
 process.stdin.on('keypress',push);
 try{while(true){if(!queue.length)await new Promise(r=>wake=r);while(queue.length)yield queue.shift()}}
 finally{process.stdin.off('keypress',push)}
}
function findSid(){
 const out=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true});
 const match=out.match(/S-1-\d+(?:-\d+)+/);
 if(!match)throw Error('Windows kullanıcı kimliği okunamadı.');
 return match[0];
}
function lock(file){
 execFileSync('icacls.exe',[file,'/inheritance:r','/grant:r','*'+findSid()+':(F)'],
 {windowsHide:true,stdio:'pipe'});
}
function subnet(){
 const list=new Set();
 for(const group of Object.values(os.networkInterfaces()))
  for(const n of group||[])
   if(n.family==='IPv4'&&!n.internal&&lanIP(n.address))
    list.add(n.address.split('.').slice(0,3).join('.')+'.');
 return [...list].slice(0,2);
}
async function reachable(ip,port=9100,timeout=450){
 return new Promise(resolve=>{
  const socket=net.createConnection({host:ip,port});
  let completed=false;
  const finish=ok=>{if(completed)return;completed=true;socket.destroy();resolve(ok)};
  socket.setTimeout(timeout,()=>finish(false));
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
 });
}
async function discover(){
 const addresses=subnet().flatMap(s=>Array.from({length:254},(_,i)=>s+(i+1)));
 const found=[];let next=0;
 await Promise.all(Array.from({length:32},async()=>{
  while(next<addresses.length){
   const ip=addresses[next++];
   if(await reachable(ip))found.push(ip);
  }
 }));
 return found.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function save(cfg){
 fs.mkdirSync(root,{recursive:true});
 const tmp=config+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(cfg,null,2));
  lock(tmp);
  fs.renameSync(tmp,config);
  lock(config);
  fs.copyFileSync(fileURLToPath(new URL('./print-agent.mjs',import.meta.url)),target);
  lock(target);
  const method=configureStartup({nodePath:process.execPath,scriptPath:target,mode:'single'});
  console.log('Windows otomatik açılış: '+method.description+' (CMD başlangıcı yok).');
 }catch(e){
  try{fs.unlinkSync(tmp)}catch{}
  throw Error('Güvenli kurulum yapılamadı: '+e.message);
 }
}
function start(){
 const log=fs.openSync(path.join(root,'printer.log'),'a');
 try{
  const child=spawn(process.execPath,[target,'--live'],{
   cwd:root,stdio:['ignore',log,log],detached:true,windowsHide:true
  });
  child.unref();
 }finally{fs.closeSync(log)}
}
async function printTest(){
 const child=spawn(process.execPath,[target,'--test-printer'],{stdio:'inherit'});
 return await new Promise(resolve=>{
  child.once('exit',code=>resolve(code===0));
  child.once('error',()=>resolve(false));
 });
}
async function main(){
 if(process.platform!=='win32')throw Error('Bu kurulum Windows içindir.');
 if(Number(process.versions.node.split('.')[0])<20)throw Error('Resmî Node.js 20+ LTS gerekiyor.');
 if(process.argv.includes('--check')){
  fs.accessSync(new URL('./print-agent.mjs',import.meta.url));
  fs.accessSync(new URL('./windows-startup.mjs',import.meta.url));
  console.log('OynaBak kurulum dosyaları hazır.');
  return;
 }
 console.log('\n=== OYNABAK YAZICI BAĞLANTISI ===\n');
 console.log('Önce https://oynabak.com/printer-admin.html adresinde');
 console.log('İşletme seç > Cihaz Eşleştir yap ve anahtarı kopyala.\n');
 const token=await readToken();
 if(!validToken(token))throw Error('Cihaz anahtarı hatalı. Panelden kopyala.');
 console.log('\nYazıcı aranıyor, Ethernet kablosunu kontrol et...');
 const ips=await discover();
 for(let i=0;i<ips.length;i++)console.log((i+1)+') '+ips[i]);
 const answer=await ask(ips.length?'Yazıcı numarası veya IP adresi: ':'Yazıcı IP adresi (örn. 192.168.1.100): ');
 const host=/^\d+$/.test(answer)&&Number(answer)>0&&Number(answer)<=ips.length
  ?ips[Number(answer)-1]:answer;
 if(!lanIP(host))throw Error('Yazıcı IP adresi yerel IPv4 olmalı.');
 if(!await reachable(host,9100,3500))throw Error('Yazıcıya erişilemiyor. Modem ve IP adresini kontrol et.');
 const paperInput=(await ask('Termal kağıt genişliği (80 veya 58, varsayılan 80): '))||'80';
 if(!['80','58'].includes(paperInput))throw Error('Kağıt genişliği 80 veya 58 olmalı.');
 const paperWidth=Number(paperInput);
 console.log('OynaBak yönetici panelinde kağıt genişliği de '+paperWidth+' mm olmalı.');
 save({device_token:token,printer_host:host,printer_port:9100,paper_width_mm:paperWidth});
 console.log('\nGüvenli bağlantı kaydedildi.');
 const doTest=(await ask('Şimdi test fişi çıksın mı? (E/h): ')).toLowerCase();
 if(doTest==='h'||doTest==='hayır'){
  console.log('Test yapılmadı. Otomatik yazdırmayı açma.');return;
 }
 if(!await printTest()){
  console.log('Yazıcı test edilemedi. Kâğıdı, kapağı, IP adresini kontrol et.');return;
 }
 const ok=(await ask('Fiş çıktı ve Türkçe karakterler doğru mu? (e/H): ')).toLowerCase();
 if(ok!=='e'&&ok!=='evet'){
  console.log('Fiziksel test doğrulanmadı. Otomatik yazdırmayı açma.');return;
 }
 start();
 console.log('\nBAĞLANTI BAŞLADI. Windows açılışında tekrar çalışacak.');
 console.log('SON ADIM: https://oynabak.com/printer-admin.html');
 console.log('Yazıcı servisini etkinleştir + Otomatik yazdır seç.');
}
main().catch(e=>{console.error('\nHATA: '+e.message);process.exitCode=1})
 .finally(()=>ui.close());
