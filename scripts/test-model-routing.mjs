import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {root,read} from './recipes.mjs';
const require=createRequire(import.meta.url);
const kit=require('../skills/model-task-prompts/scripts/prompt-kit.js');
const routing=read('catalog/agency-routing.json');
const base=read('skills/model-task-prompts/assets/task.example.json');
const oldModels=['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol','gpt-6-astra','claude-opus-5[1m]','claude-fable-5-1','claude-sonnet-5','gemini-3.8-flash','grok-4.6'];
assert.deepEqual(Object.keys(kit.bindings),['gpt-6.1-sol']);
let count=0;
for(const effort of ['high','xhigh']){
 const config={provider:'codex',model:'gpt-6.1-sol',effort,serviceTier:'default'};
 assert.match(kit.compile({...base,model:config}),new RegExp(`gpt-6\\.1-sol; effort=${effort}; serviceTier=default`));count++;
}
for(const model of oldModels){assert.throws(()=>kit.compile({...base,model:{...base.model,model}}));count++;assert.equal(kit.bindings[model],undefined);}
for(const effort of ['none','minimal','ultracode','invalid']){assert.throws(()=>kit.compile({...base,model:{...base.model,effort}}));count++;}
assert.throws(()=>kit.compile({...base,model:{...base.model,provider:'openai'}}));count++;
const walk=value=>{
 if(!value||typeof value!=='object')return;
 if(typeof value.provider==='string'&&typeof value.model==='string'){
  assert.equal(value.provider,'codex');
  assert.equal(value.model,'gpt-6.1-sol');assert.ok(['high','xhigh'].includes(value.effort));assert.equal(value.serviceTier,'default');
  kit.validate({...base,model:value});count++;
 }
 for(const item of Object.values(value))walk(item);
};
walk(routing);
assert.equal(routing.luna_policy,undefined);
assert.equal(routing.codex_policy.start.effort,'high');
assert.equal(routing.codex_policy.escalate.effort,'xhigh');
for(const profile of Object.values(routing.profiles)){assert.equal(profile.fallback,null);count++;}
assert.doesNotMatch(JSON.stringify(routing),/Luna|Astra|gpt-5\.6|Sol Medium|Terra/i);
const html=fs.readFileSync(path.join(root,'models.html'),'utf8');
assert.doesNotMatch(html,/claude-code|acp-antigravity|acp-cursor|claude-opus|claude-fable|claude-sonnet|gemini-3\.8-flash|grok-4\.6/i);
assert.doesNotMatch(html,/\$\('family'\)/);
assert.doesNotMatch(html,/gpt-5\.6|gpt-6-astra|Luna|Astra|Terra|Sol Medium/i);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',scrollTop:0,append(){},addEventListener(){},querySelector(){return {textContent:''};},classList:{toggle(){},remove(){},contains(){return false;}}});return nodes.get(id);};
node('catalog').textContent=JSON.stringify(routing);
const context=vm.createContext({document:{getElementById:node,createElement:()=>({dataset:{}}),querySelectorAll:()=>[],addEventListener(){}},console,setTimeout,clearTimeout,matchMedia:()=>({matches:false})});
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/application\/json/.test(match[1]))vm.runInContext(match[2],context);
for(const task of routing.tasks){
 context.taskId=task.id;
 vm.runInContext('selected=taskId;renderDetail()',context);
 assert.ok(node('detail').innerHTML.includes('Резервной модели нет'));count++;
 const whole=vm.runInContext("prompt(C.tasks.find(t=>t.id===taskId),'whole')",context);
 assert.match(whole,/Если требуется независимая проверка[\s\S]*GPT-6\.1 Sol в свежем контексте[\s\S]*Самопроверка автора не считается независимой/);count++;
 if(task.route.length>1)assert.match(whole,/codex \/ gpt-6\.1-sol; effort=high; serviceTier=default/);
 for(const stage of task.route){
  context.stage=stage;
  const output=vm.runInContext('prompt(C.tasks.find(t=>t.id===taskId),stage)',context);
  if(stage==='CHECK'){assert.match(output,/Если требуется независимая проверка[\s\S]*GPT-6\.1 Sol в свежем контексте[\s\S]*Самопроверка автора не считается независимой/);count++;}
  const config=task.model_overrides?.[stage]||routing.profiles[stage].primary;
  assert.ok(output.includes(`${config.provider} / ${config.model}; effort=${config.effort}; serviceTier=${config.serviceTier}`));count++;
 }
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'model-routing-export-'));
try{
 const result=spawnSync(process.execPath,[path.join(root,'scripts/copy-task.mjs'),'copy','RESEARCH-01',temp,'research'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const exported=require(path.join(temp,'work/tasks/research/_kit/skills/model-task-prompts/scripts/prompt-kit.js'));
 assert.match(exported.compile(base),/gpt-6\.1-sol; effort=high/);count++;
 assert.match(exported.compile(base),/Если требуется независимая проверка[\s\S]*GPT-6\.1 Sol в свежем контексте[\s\S]*Самопроверка автора не считается независимой/);count++;
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log(JSON.stringify({passed:count,failed:0,scope:'model policy, rejected configurations, all browser routes, exported compiler'}));
