'use strict';
const assert=require('node:assert/strict'),A=require('../assets/uma-race-art.js'),catalog=require('../assets/uma-race-art-catalog.json');
assert.equal(catalog.assets.length,272);
assert.equal(A.resolve({variant_id:111602},catalog).costume_id,'111626');
assert.equal(A.resolve({character_id:1116,costume_id:111626},catalog).card_id,'111602');
assert.equal(A.resolve({card:111601},catalog).outfit_id,'original');
for(const row of [{character_id:1116},{variant_id:111699},{variant_id:111602,costume_id:111601},{card:'<script>'}])assert.equal(A.resolve(row,catalog),null);
for(const a of catalog.assets){assert(a.width>=768&&a.height>=1024);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(a.status,'available');}
console.log('Race art: 272 native-resolution variants, exact card/costume mapping and missing/conflicting outfit handling passed.');
