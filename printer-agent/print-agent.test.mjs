import test from 'node:test';
import assert from 'node:assert/strict';
import {receipt,lanIP,encodeCP857,decodePrinterStatus} from './print-agent.mjs';

const order={
 table_no:8,customer_note:'Şekersiz çay, çiğ köfte',
 items:[
  {name:'İskender',quantity:2,note:'Soğansız',station:'kitchen'},
  {name:'Sütlü kahve',quantity:1,station:'bar'}
 ]
};
test('CP857 encodes Turkish letters correctly',()=>{
 const bytes=encodeCP857('ÇçĞğİıÖöŞşÜü');
 assert.deepEqual([...bytes],[128,135,166,167,152,141,153,148,158,159,154,129]);
});
test('ESC/POS receipt selects Rongta page 29 CP857',()=>{
 const bytes=receipt(order,80);
 assert.equal(bytes.subarray(0,5).toString('hex'),'1b401b741d');
 assert.equal(bytes.subarray(-3).toString('hex'),'1d5600');
 assert.ok(bytes.includes(Buffer.from([152]))); // İ
 assert.ok(bytes.includes(Buffer.from([158]))); // Ş
});
test('Kitchen receipts do not include bar items',()=>{
 const bytes=receipt(order,80,'kitchen');
 assert.ok(bytes.includes(Buffer.from('skender'))); // first char encoded
 assert.equal(bytes.includes(Buffer.from('kahve')),false);
});
test('58 mm receipt supports Turkish notes',()=>{
 const bytes=receipt(order,58);
 assert.ok(bytes.includes(Buffer.from([158,101,107,101,114,115,105,122]))); // Şekersiz
});
test('Invalid quantities, stations and sizes are rejected',()=>{
 assert.throws(()=>receipt({...order,items:[{name:'x',quantity:0,station:'bar'}]}));
 assert.throws(()=>receipt(order,58,'unknown-station'));
 assert.throws(()=>receipt(order,70));
});
test('Only literal private LAN IPv4 allowed',()=>{
 assert.equal(lanIP('192.168.1.50'),true);
 assert.equal(lanIP('10.1.2.3'),true);
 assert.equal(lanIP('172.16.1.5'),true);
 assert.equal(lanIP('8.8.8.8'),false);
 assert.equal(lanIP('printer.example.org'),false);
 assert.equal(lanIP('127.0.0.1'),false);
});
test('Printer cover/error/paper sensors stop writing before receipt',()=>{
 assert.equal(decodePrinterStatus(Buffer.from([0x12,0x12,0x12])),true);
 assert.throws(()=>decodePrinterStatus(Buffer.from([0x16,0x12,0x12])),/kapağı/);
 assert.throws(()=>decodePrinterStatus(Buffer.from([0x12,0x1a,0x12])),/arızalı/);
 assert.throws(()=>decodePrinterStatus(Buffer.from([0x12,0x12,0x72])),/kâğıt/);
 assert.throws(()=>decodePrinterStatus(Buffer.from([0x12])),/eksik/);
});


test('Professional cashier and kitchen tickets use independent headings and large table',()=>{
 const p={table_no:5,submitted_at:'2026-11-07T19:25:00+03:00',items:[
  {name:'Hamburger',quantity:2,note:'Soğansız'},
  {name:'Kola',quantity:1}
 ],customer_note:'Az tuzlu'};
 const kitchen=receipt(p,80,'all','kitchen');
 const cashier=receipt(p,80,'all','cashier');
 assert.ok(kitchen.includes(Buffer.from('MUTFAK S')));
 assert.ok(cashier.includes(Buffer.from('KASA S')));
 assert.ok(kitchen.includes(Buffer.from([29,33,0x11])));
 assert.ok(kitchen.includes(Buffer.from([29,33,0x00])));
 assert.ok(kitchen.includes(Buffer.from('MASA 5')));
 assert.ok(kitchen.includes(Buffer.from('2 x Hamburger')));
 assert.ok(kitchen.includes(Buffer.from('07.11.2026')));
 assert.ok(kitchen.includes(Buffer.from('19:25')));
 assert.ok(kitchen.includes(Buffer.from('So')));
 assert.ok(kitchen.includes(Buffer.from('Az tuzlu')));
 assert.ok(!kitchen.includes(Buffer.from('cek numarasi')));
 assert.equal(cashier.subarray(-3).toString('hex'),'1d5600');
});

test('58mm narrow paper preserves product notes and emits safe 2x title',()=>{
 const p={table_no:12,items:[{name:'Karisik tost ve ekstra domates',quantity:3,note:'Acisiz'}]};
 const bytes=receipt(p,58,'all','kitchen');
 assert.ok(bytes.includes(Buffer.from('MASA 12')));
 assert.ok(bytes.includes(Buffer.from([29,33,17])));
 assert.ok(bytes.includes(Buffer.from('3 x Karisik tost')));
 assert.ok(bytes.includes(Buffer.from('Acisiz')));
 assert.equal(bytes.subarray(-3).toString('hex'),'1d5600');
});
