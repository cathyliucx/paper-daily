import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function reader(stored) {
  let saved = stored;
  const context = vm.createContext({
    document: { body: {dataset:{}}, querySelector:()=>null, querySelectorAll:()=>[] },
    localStorage: {getItem:()=>saved, setItem:(_,value)=>{saved=value;}},
  });
  // Load the real reader helpers without starting its DOM/network entry point.
  const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/\nmain\(\);\s*$/,'');
  vm.runInContext(source,context);
  return { context, saved:()=>saved };
}

test('previous eye-mode preferences safely migrate to dark',()=>{
  const state=reader('eye');
  assert.equal(vm.runInContext('storedTheme()',state.context),'dark');
  vm.runInContext('applyTheme(storedTheme())',state.context);
  assert.equal(state.context.document.body.dataset.theme,'dark');
  assert.equal(state.saved(),'dark');
});

test('dark and light preferences remain supported',()=>{
  for(const theme of ['dark','light']) assert.equal(vm.runInContext('storedTheme()',reader(theme).context),theme);
});

test('the theme selector offers exactly dark and light',()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  assert.deepEqual([...html.matchAll(/data-theme-option="([^"]+)"/g)].map(match=>match[1]),['dark','light']);
});
