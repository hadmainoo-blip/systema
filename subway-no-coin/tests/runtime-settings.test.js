import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBackend,isSupportedGame} from '../extension/runtime-settings.js';
test('fresh installs and old untrained learned settings use the built-in pilot',()=>{assert.equal(selectBackend(), 'auto');assert.equal(selectBackend('learned',false),'auto');assert.equal(selectBackend('unknown',true),'auto');});
test('trained and explicit experimental settings remain available',()=>{assert.equal(selectBackend('learned',true),'learned');assert.equal(selectBackend('vision'),'vision');});
test('native integration is restricted to the verified HTTPS game',()=>{assert.ok(isSupportedGame('https://ashuni.lol/legacy/sanfrancisco/?mode=original'));assert.ok(isSupportedGame('https://www.ashuni.lol/legacy/sanfrancisco'));for(const url of ['https://example.com/legacy/sanfrancisco/','https://ashuni.lol/journey-to-the-east/','http://ashuni.lol/legacy/sanfrancisco/','not a url'])assert.equal(isSupportedGame(url),false);});
