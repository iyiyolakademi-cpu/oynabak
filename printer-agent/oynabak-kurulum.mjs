#!/usr/bin/env node
// One simple installer entry point for one or two Ethernet printers.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const rl=createInterface({input:process.stdin,output:process.stdout});
const ask=q=>new Promise(done=>rl.question(q,a=>done(a.trim())));
async function main(){
 if(process.argv.includes('--check')){
  console.log('OynaBak kurulum secim dosyasi hazir');return;
 }
 console.log('\n=================================================');
 console.log(' OYNABAK  |  QR SIPARIS OTOMATIK YAZDIRMA');
 console.log('=================================================\n');
 console.log('Musteri QR okutacak > siparis verecek > fis cikacak.');
 console.log('Yaziciya baglama secenegini secin:\n');
 console.log('  1 - Tek yazici (tum siparisler)');
 console.log('  2 - Iki yazici (kasa + mutfak, ikisine ayri fis)\n');
 const answer=await ask('Kac yazici baglayacaksiniz? (1/2): ');
 if(!['1','2'].includes(answer))throw Error('Lutfen 1 veya 2 yazin.');
 rl.close();
 const script=fileURLToPath(new URL(answer==='1'?'./kolay-kurulum.mjs':'./kasa-mutfak-kurulum.mjs',import.meta.url));
 const child=spawn(process.execPath,[script],{stdio:'inherit',windowsHide:false});
 const result=await new Promise((resolve,reject)=>{
  child.on('error',reject);child.on('exit',code=>resolve(code));
 });
 if(result!==0)process.exitCode=result||1;
}
main().catch(err=>{console.error('OynaBak: '+err.message);process.exitCode=1;rl.close()});
