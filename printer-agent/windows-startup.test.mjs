import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {configureStartup,taskName,runName} from './windows-startup.mjs';

const args={nodePath:process.execPath,scriptPath:fileURLToPath(new URL('./print-agent.mjs',import.meta.url)),mode:'single',appData:'',platform:'win32'};

test('startup uses Windows Task Scheduler when permitted and does not run CMD',()=>{
 const calls=[];
 const result=configureStartup({...args,run:(exe,argv)=>{calls.push([exe,argv]);return {ok:true}}});
 assert.equal(result.method,'task');
 const create=calls.find(([exe,argv])=>exe==='schtasks.exe'&&argv.includes('/create'));
 if(process.env.USERNAME||process.env.USERDOMAIN){
  assert.ok(create);
  assert.ok(create[1].includes('/it'));
  assert.ok(create[1].includes(taskName));
  assert.ok(!calls.some(([exe,argv])=>exe==='reg.exe'&&argv.includes('/add')));
 }
});

test('blocked Task Scheduler falls back to HKCU Run; never uses .cmd',()=>{
 const calls=[];
 const result=configureStartup({...args,run:(exe,argv)=>{
  calls.push([exe,argv]);
  if(exe==='schtasks.exe'&&argv.includes('/create'))return {ok:false,error:'access denied'};
  return {ok:true};
 }});
 assert.equal(result.method,process.env.USERNAME?'registry':'registry');
 const register=calls.find(([exe,argv])=>exe==='reg.exe'&&argv.includes('/add'));
 assert.ok(register);
 assert.ok(register[1].includes(runName));
 const launch=register[1][register[1].indexOf('/d')+1];
 assert.ok(launch.includes('--live'));
 assert.ok(!launch.includes('.cmd'));
});
