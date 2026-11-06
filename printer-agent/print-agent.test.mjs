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
