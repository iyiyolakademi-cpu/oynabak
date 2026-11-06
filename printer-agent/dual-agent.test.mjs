import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from './dual-agent.mjs';
import {receipt} from './print-agent.mjs';

const token='obp_'+('a'.repeat(64));
const config={
 device_token:token,
 printers:{
  kitchen:{host:'192.168.1.50',port:9100,width:80},
  cashier:{host:'192.168.1.51',port:9100,width:80}
 }
};
test('dual printer accepts two private LAN devices',()=>{
 assert.equal(validateConfig(config),config);
});
test('dual printer rejects public destinations and duplicate physical printer',()=>{
 assert.throws(()=>validateConfig({...config,printers:{...config.printers,cashier:{...config.printers.cashier,host:'8.8.8.8'}}}),/yerel IPv4/);
 assert.throws(()=>validateConfig({...config,printers:{...config.printers,cashier:{...config.printers.kitchen}}}),/aynı fiziksel/);
 assert.throws(()=>validateConfig({...config,device_token:'not-a-token'}),/anahtarı/);
});
test('cashier and kitchen each include every item, without changing order payload',()=>{
 const payload={table_no:8,items:[
  {name:'Hamburger',quantity:2},{name:'Kola',quantity:1}
 ],customer_note:'Az tuzlu'};
 const kitchen=receipt(payload,80,'all','kitchen');
 const cashier=receipt(payload,80,'all','cashier');
 assert.notDeepEqual(kitchen,cashier);
 assert.ok(kitchen.includes(Buffer.from('Hamburger')));
 assert.ok(kitchen.includes(Buffer.from('Kola')));
 assert.ok(cashier.includes(Buffer.from('Hamburger')));
 assert.ok(cashier.includes(Buffer.from('Kola')));
 assert.equal(payload.items.length,2);
});
test('ESC/POS receipt keeps Turkish codepage commands',()=>{
 const bytes=receipt({table_no:2,items:[{name:'Çiğ köfte',quantity:1}]},80,'all','cashier');
 assert.equal(bytes[0],27);assert.equal(bytes[1],64);
 assert.ok(bytes.includes(Buffer.from([27,116,29])));
 assert.ok(bytes.includes(Buffer.from([29,86,0])));
});
