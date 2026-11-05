import test from 'node:test';
import assert from 'node:assert/strict';
import {receipt,isLanIp} from './print-agent.mjs';

const sample={
  table_no:8,customer_note:'Az tuzlu',
  items:[
    {name:'Hamburger',quantity:2,note:'Sogansiz',station:'kitchen'},
    {name:'Ayran',quantity:1,station:'bar'}
  ]
};
test('80 mm print job includes table and selected order items',()=>{
 const bytes=receipt(sample,80,'all');
 const text=bytes.toString('ascii');
 assert.match(text,/OYNABAK/);
 assert.match(text,/MASA 8/);
 assert.match(text,/2 x Hamburger/);
 assert.match(text,/1 x Ayran/);
 assert.equal(bytes.subarray(-3).toString('hex'),'1d5600');
});
test('kitchen station filters bar products',()=>{
 const text=receipt(sample,80,'kitchen').toString('ascii');
 assert.match(text,/Hamburger/);
 assert.doesNotMatch(text,/Ayran/);
});
test('58 mm receipts and notes',()=>{
 const text=receipt({...sample,customer_note:'Sogansiz'},58,'all').toString('ascii');
 assert.match(text,/NOT: Sogansiz/);
});
test('rejects invalid order quantities and no matching station',()=>{
 assert.throws(()=>receipt({...sample,items:[{name:'X',quantity:0,station:'kitchen'}]}));
 assert.throws(()=>receipt(sample,80,'storage'));
});
test('only LAN printer IPs accepted',()=>{
 assert.equal(isLanIp('192.168.1.20'),true);
 assert.equal(isLanIp('10.0.0.2'),true);
 assert.equal(isLanIp('172.16.1.1'),true);
 assert.equal(isLanIp('8.8.8.8'),false);
 assert.equal(isLanIp('printer.example.com'),false);
});