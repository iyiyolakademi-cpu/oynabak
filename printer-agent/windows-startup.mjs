// OynaBak Windows startup helper. No unsigned EXE or .cmd at logon.
// Prefer built-in Windows Task Scheduler; fall back to HKCU Run only if blocked.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const legacyNames=['OynaBak-Yazici.cmd','OynaBak-Kasa-Mutfak.cmd'];
const runKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const taskName='OynaBak QR Otomatik Yazici';
export const runName='OynaBakAutoPrinter';
const quote=v=>'"'+String(v).replaceAll('"','')+'"';

function windowsUser(){
 return process.env.USERDOMAIN&&process.env.USERNAME
  ?process.env.USERDOMAIN+'\\'+process.env.USERNAME
  :process.env.USERNAME;
}
function attempt(exe,args){
 try{return {ok:true,output:execFileSync(exe,args,{windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']})}}
 catch(err){return {ok:false,error:String(err.stderr||err.message||'').slice(0,240)}}
}
export function configureStartup({nodePath,scriptPath,mode,appData=process.env.APPDATA,platform=process.platform,run=attempt}){
 if(platform!=='win32')throw Error('Windows gereklidir');
 if(!['single','dual'].includes(mode))throw Error('Bilinmeyen yazici modu');
 if(!fs.existsSync(nodePath)||!fs.existsSync(scriptPath))throw Error('Node veya yazdirma dosyasi bulunamadi');
 const command=quote(nodePath)+' '+quote(scriptPath)+' --live';
 // Never leave both the old .cmd and a new startup mechanism active.
 if(appData)for(const file of legacyNames){
  const old=path.join(appData,'Microsoft','Windows','Start Menu','Programs','Startup',file);
  if(fs.existsSync(old))fs.unlinkSync(old);
 }
 // Remove previous app-owned run entry (including earlier legacy label).
 for(const name of [runName,'OynaBak Yazici'])run('reg.exe',['delete',runKey,'/v',name,'/f']);
 run('schtasks.exe',['/delete','/tn',taskName,'/f']);
 // /it ensures it runs in the interactive session, no saved Windows password.
 const user=windowsUser();
 if(user){
  const created=run('schtasks.exe',['/create','/f','/sc','onlogon','/tn',taskName,
   '/tr',command,'/ru',user,'/it','/rl','LIMITED']);
  if(created.ok)return {method:'task',description:'Windows Gorev Zamanlayicisi'};
 }
 const registered=run('reg.exe',['add',runKey,'/v',runName,'/t','REG_SZ','/d',command,'/f']);
 if(!registered.ok)throw Error('Windows otomatik acilis ayarlanamadi: '+registered.error);
 return {method:'registry',description:'Windows kullanici otomatik baslangici (acilista konsol gorunebilir)'};
}
