'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),kit=require('./prompt-kit.js'),ctx=require('./project-context.js');
const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/agency-operating-model.json')));let count=0;
const keys=new Set(spec.knowledge.map(x=>x.key));assert.equal(keys.size,16);count++;
assert.equal(spec.departments.length,16);count++;
for(const d of spec.departments){assert(d.reads.every(k=>keys.has(k)));count++;}
for(const j of spec.journeys){const seen=new Set();for(const n of j.nodes){assert(!seen.has(n.id));assert(n.depends_on.every(d=>seen.has(d)),'Missing, out of order or cyclic dependency '+n.id);seen.add(n.id);if(n.kind==='human')assert(n.human_question&&n.decision_pack);if(n.on_rework)assert(j.nodes.some(v=>v.id===n.on_rework));count++;}}
assert(ctx.forTask(spec,'DESIGN-01').gates.some(g=>g.id==='competitor-research'));count++;
assert(!ctx.forTask(spec,'DESIGN-05').gates.some(g=>g.id==='competitor-research'));count++;
assert.equal(ctx.forTask(spec,'BRIEF-03').work_context.workspace,'calls/<call-id>/');count++;
assert(ctx.forTask(spec,'ADS-04').context_requirements.some(x=>x.key==='audience.pains'));count++;
function task(){const t=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/task.example.json')));Object.assign(t,ctx.forTask(spec,'DESIGN-05'));t.status='ready';t.inputs=['article.md'];t.storage.root='/example/task';t.work_context.workspace='design/requests/request-one/';t.tools=[];t.context_requirements.forEach(x=>{x.status='accepted';x.version='v3'});t.gates=[{id:'review',kind:'human',phase:'entry',status:'approved',subject_version:'v3',current_version:'v3',decided_by:'owner',decided_at:'2026-09-14',decision_ref:'decisions/review.json'}];return t;}
assert.match(kit.compile(task()),/Gates и решения/);count++;
{const t=task();t.gates[0].current_version='v4';assert.throws(()=>kit.compile(t),/gate/);count++;}
{const t=task();delete t.gates[0].decision_ref;assert.throws(()=>kit.compile(t),/gate/);count++;}
{const t=task();t.context_requirements[0].status='unverified';assert.throws(()=>kit.compile(t),/контекста/);count++;}
{const t=task();t.skills[0].selected=true;assert.throws(()=>kit.compile(t),/SKILL/);count++;}
{const t=task();t.gates[0].phase='exit';t.gates[0].status='pending';assert.doesNotThrow(()=>kit.compile(t));count++;}
{const t=task();t.gates[0].status='waived';t.gates[0].reason='Допустимое исключение';assert.doesNotThrow(()=>kit.compile(t));count++;}
assert.equal(spec.outcomes.length,80);count++;
assert.equal(new Set(spec.outcomes.map(o=>o.group)).size,16);count++;
assert.equal(new Set(spec.journeys.map(j=>j.id)).size,spec.journeys.length);count++;
const sources=new Set(spec.sources.map(s=>s.id));
for(const o of spec.outcomes){assert(spec.journeys.some(j=>j.id===o.journey_id));assert(o.source_ids.every(id=>sources.has(id)));assert(o.deliverables.length&&o.acceptance.length);count++;}
const editorial=ctx.forTask(spec,'CONTENT-02').handoff_contract;assert(editorial.deliverables.includes('visual-briefs.md'));assert.match(editorial.image_count,/0/);assert.match(editorial.no_images,/skip designer/);count++;
assert(!ctx.forTask(spec,'CONTENT-06').handoff_contract,'UX microcopy must not inherit an article pipeline');count++;
const art=spec.journeys.find(j=>j.id==='article-images');assert(art.nodes.findIndex(n=>n.id==='a-plan-review')<art.nodes.findIndex(n=>n.id==='a-art'));assert(art.nodes.find(n=>n.id==='a-art').applies_when.includes('slots=[]'));assert(art.nodes.some(n=>n.id==='a-preview'));count++;
const sales=spec.journeys.find(j=>j.outcome_id==='OUT-066');assert(sales.nodes.findIndex(n=>n.kind==='human')<sales.nodes.findIndex(n=>n.id==='prospect-8'));count++;
console.log(JSON.stringify({passed:count,failed:0,scope:'department mappings, graph dependencies, context and gates'}));
