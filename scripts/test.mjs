import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {root,read,recipes,byId,prompt} from './recipes.mjs';
let checks=0;const check=(fn)=>{fn();checks++;};
check(()=>assert.equal(recipes.length,208));
check(()=>assert.equal(new Set(recipes.map(r=>r.id)).size,208));
for(const r of recipes){
 check(()=>{assert.ok(r.minimum_input);assert.ok(prompt(r).includes('[опишите ситуацию'));assert.equal(r.execution.mode,'single-agent');});
 const manifest=read(`prompts/${r.id}/manifest.json`);
 check(()=>{for(const item of manifest.copy)assert.ok(fs.existsSync(path.join(root,item.from)),item.from);for(const p of r.preparation_options)assert.ok(byId[p.recipe_id]);});
}
const run=(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/copy-task.mjs'),...args],{encoding:'utf8'});
check(()=>assert.equal(JSON.parse(run('find','Созвон → решения и задачи').stdout).id,'BRIEF-03'));
check(()=>assert.equal(JSON.parse(run('find','Бриф и список вопросов клиенту').stdout).id,'BRIEF-02'));
check(()=>assert.notEqual(run('find','Созвон').status,0));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agency-router-test-'));
try{
 for(const id of ['BRIEF-02','OUT-001']){
  const task=id.toLowerCase();check(()=>assert.equal(run('copy',id,temp,task).status,0));
  const dest=path.join(temp,'work/tasks',task);
  check(()=>{assert.equal(readRelative(dest,'package.json').status,'draft');assert.ok(fs.existsSync(path.join(dest,'_kit/skills/model-task-prompts/references/project-passport.md')));assert.ok(fs.existsSync(path.join(dest,'_kit/skills/agency-artifacts/assets/metadata.schema.json')));});
  const prior=fs.readFileSync(path.join(dest,'request.md'),'utf8');
  check(()=>{assert.notEqual(run('copy',id,temp,task).status,0);assert.equal(fs.readFileSync(path.join(dest,'request.md'),'utf8'),prior);});
 }
 check(()=>assert.notEqual(run('copy','BRIEF-02',temp,'../escape').status,0));
 const linked=path.join(temp,'linked');fs.mkdirSync(linked);fs.symlinkSync(path.join(temp,'work'),path.join(linked,'work'));
 check(()=>assert.notEqual(run('copy','BRIEF-02',linked,'unsafe').status,0));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
for(const f of ['index.html','start.html','models.html']){
 const html=fs.readFileSync(path.join(root,f),'utf8');
 check(()=>assert.ok(!/BLUEPRINT_DATA|RECIPES_DATA|BLUEPRINT_JSON|PROMPT_KIT|>PAYLOAD</.test(html)));
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  check(()=>{if(/application\/json/.test(m[1]))JSON.parse(m[2]);else new vm.Script(m[2]);});
 }
}
console.log(JSON.stringify({passed:checks,failed:0,scope:'recipes, dependency manifests, safe copy, HTML scripts; no business performance claim'}));
function readRelative(base,p){return JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));}
