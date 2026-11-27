const test=require('node:test');
const assert=require('node:assert/strict');
const {timeoutMs}=require('../fitspec-timeout');
test('FitSpec timeout and hard cap',()=>{for(const [n,ms] of [[0,300000],[90,105000],[290,300000],[300,300000]]) assert.equal(timeoutMs(`main = mainWith args { timeout = ${n} }`),ms);});
test('invalid timeouts rejected',()=>{for(const n of ['301','-1','1.5','foo']) assert.throws(()=>timeoutMs(`args { timeout = ${n} }`));});
test('comments do not set timeout',()=>assert.equal(timeoutMs('-- timeout = 999\nargs { timeout = 90 }'),105000));
