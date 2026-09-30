import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const codexBin=process.env.AGENCY_CODEX_BIN||'codex';
const pilotEnv={...process.env};delete pilotEnv.OPENAI_API_KEY;delete pilotEnv.CODEX_API_KEY;
const login=spawnSync(codexBin,['login','status'],{env:pilotEnv,encoding:'utf8'});
if(login.status!==0||!((login.stdout||'')+'\n'+(login.stderr||'')).includes('Logged in using ChatGPT'))throw Error('Для пилота нужен вход Codex через ChatGPT; API-вход не допускается.');
const scratch=fs.mkdtempSync(path.join('/tmp','agency-router-sol-pilot-'));
const outputDir=process.argv[2]?path.resolve(process.argv[2]):scratch;fs.mkdirSync(outputDir,{recursive:true});
const str={type:'string'},num={type:'number'},strings={type:'array',items:str};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const fixtures=[
 {id:'BRIEF-03',title:'Поздние поправки в протоколе',input:`Учебный протокол. Даты относятся к 2026 году.\nu01 Марина: Запуск 1 октября, бюджет 100000 рублей.\nu02 Павел: Дизайн будет 30 сентября.\nu03 Анна: Тексты будут 29 сентября.\nu04 Марина: Исправляю запуск на 5 октября, бюджет на 80000 рублей; прежние значения отменяем.\nu05 Павел: Исправляю срок дизайна на 2 октября.\nu06 Анна: Исправляю срок текстов на 30 сентября.\nu07 Марина: Клиент утверждает 3 октября после получения текстов и дизайна. Запуск только после утверждения.\nu08 Марина: За запуск отвечает Иван.\nСоставь актуальные действия с id text/design/approval/launch, ответственным, итоговым сроком ISO, dependencies (id) и source_ids. Неподтверждённые зависимости не добавляй. Отдельно верни актуальный budget_rub.`,schema:object({budget_rub:num,actions:{type:'array',items:object({id:str,owner:str,due:str,dependencies:strings,source_ids:strings})}})},
 {id:'ANALYTICS-02',title:'Валюты, знаменатели и неполный период',input:`Учебные данные. Неделя 1 (семь полных дней): реклама A, расход 9000 RUB, лиды 30, клики 150; реклама B, расход 100 USD, лиды 20, клики 100. Неделя 2 (семь полных дней): A, расход 12000 RUB, лиды 24, клики 120; B, расход 80 USD, лиды 16, клики 80. Для этого отчёта фиксированный курс обеих недель 90 RUB за USD. Неделя 3 пока содержит один день: расход 2000 RUB, лиды 2; это неполный период.\nДля первых двух полных недель рассчитай по всем каналам суммарные расходы RUB, лиды, клики, CPL RUB (расход/лиды) и конверсию клик→лид в процентах (лиды/клики). Затем CPL двух полных недель вместе и процентное изменение CPL недели2 относительно недели1. Среднее по CPL каналов использовать нельзя. Верни can_compare_week3 как boolean и causality как "established" либо "not_established": доказывают ли числа, что ухудшение CPL вызвано изменением рекламных креативов?`,schema:object({weeks:{type:'array',items:object({week:num,spend_rub:num,leads:num,clicks:num,cpl_rub:num,conversion_pct:num})},combined_cpl_rub:num,cpl_change_pct:num,can_compare_week3:{type:'boolean'},causality:str})},
 {id:'CRM-07',title:'Отрицания, цитаты и условный интерес',input:`Учебные ответы клиентов.\nr1: "У вас было написано 'не интересно'. Мне интересно, пришлите цены."\nr2: "Спасибо, не нужно, мы уже выбрали поставщика."\nr3: "Автоматический ответ: сотрудник в отпуске до 10 октября."\nr4: "Сейчас не готовы покупать. Вернитесь в ноябре, если будет рассрочка."\nr5: "Вы спрашиваете, интересно ли нам? Пока не знаю, обсудим внутри."\nr6: "Не пишите и не звоните нам больше."\nКлассифицируй каждый ответ id r1..r6. labels: interest, refusal, auto_reply, conditional_interest, unknown. Отдельно do_not_contact. Для r4 отсутствие немедленной покупки не отменяет условный интерес. Для r6 запрет контактов обязателен. Никакие письма не отправляй. Верни только rows.`,schema:object({rows:{type:'array',items:object({id:str,label:str,do_not_contact:{type:'boolean'}})}})}
];
fs.writeFileSync(path.join(outputDir,'fixtures.json'),JSON.stringify({kind:'synthetic_fixture_set',version:1,fixtures},null,2)+'\n');
function judge(id,output){
 const checks=[];const check=(name,passed)=>checks.push({name,passed:!!passed});
 const close=(a,b)=>typeof a==='number'&&Math.abs(a-b)<0.01;
 if(id==='BRIEF-03'){
  check('final_budget',output.budget_rub===80000);
  const expected={text:['Анна','2026-09-30',[],'u06'],design:['Павел','2026-10-02',[],'u05'],approval:['Клиент','2026-10-03',['text','design'],'u07'],launch:['Иван','2026-10-05',['approval'],'u08']};
  check('action_coverage',output.actions?.length===4&&new Set(output.actions.map(x=>x.id)).size===4);
  for(const [id,[owner,due,deps,source]] of Object.entries(expected)){
   const row=output.actions?.find(x=>x.id===id);
   check(`${id}_owner`,row?.owner?.toLowerCase()===owner.toLowerCase());check(`${id}_deadline`,row?.due===due);
   check(`${id}_dependencies`,!!row&&JSON.stringify([...row.dependencies].sort())===JSON.stringify([...deps].sort()));check(`${id}_source`,row?.source_ids?.includes(source));
  }
 }else if(id==='ANALYTICS-02'){
  check('complete_weeks_only',output.weeks?.length===2);
  for(const [week,values] of [[1,{spend_rub:18000,leads:50,clicks:250,cpl_rub:360,conversion_pct:20}],[2,{spend_rub:19200,leads:40,clicks:200,cpl_rub:480,conversion_pct:20}]]){
   const row=output.weeks?.find(x=>x.week===week);
   for(const [key,value] of Object.entries(values))check(`week${week}_${key}`,close(row?.[key],value));
  }
  check('combined_weighted_cpl',close(output.combined_cpl_rub,37200/90));check('relative_cpl_change',close(output.cpl_change_pct,100/3));
  check('incomplete_week_not_comparable',output.can_compare_week3===false);check('no_false_causality',output.causality==='not_established');
 }else{
  const expected={r1:'interest',r2:'refusal',r3:'auto_reply',r4:'conditional_interest',r5:'unknown',r6:'refusal'};
  check('reply_coverage',output.rows?.length===6&&new Set(output.rows.map(x=>x.id)).size===6);
  for(const [id,label] of Object.entries(expected)){const row=output.rows?.find(x=>x.id===id);check(`${id}_label`,row?.label===label);check(`${id}_contact`,row?.do_not_contact===(id==='r6'));}
 }
 return checks;
}
const results=[];
async function run(fixture,effort){
 const runId=fixture.id+'-'+effort,dir=path.join(scratch,runId);fs.mkdirSync(dir);
 const schema=path.join(dir,'schema.json'),final=path.join(dir,'answer.json');fs.writeFileSync(schema,JSON.stringify(fixture.schema));
 const input='Выполни ровно задачу ниже. Все данные учебные и полны для этой задачи. Интернет, файлы и внешние инструменты не нужны. Ответ только JSON по схеме. Не запускай других агентов.\n\n'+fixture.input;
 const args=['exec','--ephemeral','--json','--skip-git-repo-check','--sandbox','read-only','-C',dir,'--model','gpt-6.1-sol','-c',`model_reasoning_effort="${effort}"`,'-c','service_tier="default"','-c','web_search="disabled"','--disable','multi_agent','--output-schema',schema,'--output-last-message',final,'-'];
 const started=new Date().toISOString(),start=performance.now();
 const child=spawn(codexBin,args,{env:pilotEnv,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.on('error',()=>{});child.stdin.end(input);
 const timeout=setTimeout(()=>child.kill('SIGTERM'),240000);
 const code=await new Promise(resolve=>{child.on('error',e=>{stderr+=e.message;resolve(-1);});child.on('close',resolve)});clearTimeout(timeout);
 fs.writeFileSync(path.join(dir,'events.jsonl'),stdout);fs.writeFileSync(path.join(dir,'stderr.txt'),stderr);
 const events=stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return []}});
 let output=null,error=null;try{if(code===0)output=JSON.parse(fs.readFileSync(final,'utf8'));else error='CLI exit '+code;}catch(e){error=e.message;}
 const checks=output?judge(fixture.id,output):[];
 const result={id:fixture.id,model:'gpt-6.1-sol',effort,service_tier_requested:'default',service_tier_effective:'not_observed',input_hash:createHash('sha256').update(input).digest('hex'),started_at:started,finished_at:new Date().toISOString(),seconds:Number(((performance.now()-start)/1000).toFixed(2)),exit_code:code,usage:events.findLast(x=>x.type==='turn.completed')?.usage??null,checks,passed:checks.filter(x=>x.passed).length,total:checks.length,acceptance_pass:!!output&&checks.length>0&&checks.every(x=>x.passed),output,error};
 results.push(result);fs.writeFileSync(path.join(scratch,'results.json'),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({run:runId,seconds:result.seconds,pass:result.acceptance_pass,score:`${result.passed}/${result.total}`,error}));
}
console.log(JSON.stringify({scratch,runs:fixtures.length*2}));
// Two concurrent runs; each pair receives identical inputs and schema.
for(const fixture of fixtures)await Promise.all(['high','xhigh'].map(effort=>run(fixture,effort)));
fs.writeFileSync(path.join(outputDir,'results.json'),JSON.stringify({kind:'synthetic_model_pilot',version:1,date:new Date().toISOString().slice(0,10),limitations:['Three synthetic cases; one run per configuration and case.','No comparison to retired models or other providers.','Concurrent runs affect latency; no statistical speed conclusion.','Requested tier is default; effective tier is not observable in CLI events.','Token usage is not a measure of subscription consumption.'],results},null,2)+'\n');
console.log(JSON.stringify({complete:results.length,passed:results.filter(x=>x.acceptance_pass).length,scratch}));

if(results.some(x=>!x.acceptance_pass))process.exitCode=1;
