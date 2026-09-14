import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,read,recipes} from './recipes.mjs';
const args=process.argv.slice(2),cmd=args.shift();
const norm=s=>s.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function find(query){
 const exact=recipes.filter(r=>[r.id,r.title,...r.aliases].some(x=>norm(x)===norm(query)));
 const matches=exact.length?exact:recipes.filter(r=>norm(r.title+' '+r.id).includes(norm(query)));
 if(matches.length!==1)throw new Error('Нужно выбрать один ID. Совпадения: '+JSON.stringify(matches.map(r=>({id:r.id,title:r.title}))));
 return matches[0];
}
try{
 if(cmd==='list'){console.log(recipes.map(r=>`${r.id}\t${r.title}`).join('\n'));}
 else if(cmd==='find'){console.log(JSON.stringify(find(args.join(' ')),null,2));}
 else if(cmd==='copy'){
  const id=args.shift(),project=args.shift(),taskId=args.shift();
  if(args.length||!id||!project||!taskId)throw new Error('copy ID EXISTING_PROJECT TASK_ID');
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(taskId))throw new Error('TASK_ID: латиница, цифры, дефис, до 80 знаков');
  const r=find(id),manifest=read('prompts/'+r.id+'/manifest.json');
  const projectRoot=fs.realpathSync(project);
  if(!fs.statSync(projectRoot).isDirectory())throw new Error('Проект должен быть существующей папкой');
  const target=path.join(projectRoot,'work','tasks',taskId);
  for(const p of [path.join(projectRoot,'work'),path.join(projectRoot,'work','tasks'),target]){
   if(fs.existsSync(p)||(()=>{try{fs.lstatSync(p);return true;}catch{return false;}})()){
    const stat=fs.lstatSync(p);if(stat.isSymbolicLink()||!stat.isDirectory()||p===target)throw new Error('Нельзя перезаписать/использовать ссылку: '+p);
   }
  }
  for(const item of manifest.copy){
   if(path.isAbsolute(item.from)||path.isAbsolute(item.to)||item.from.split('/').includes('..')||item.to.split('/').includes('..'))throw new Error('Небезопасный путь manifest');
   if(!fs.existsSync(path.join(root,item.from)))throw new Error('Неполный пакет: '+item.from);
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(target);
  for(const item of manifest.copy){
   const dest=path.join(target,item.to);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.cpSync(path.join(root,item.from),dest,{recursive:true,errorOnExist:true,force:false,filter:p=>!p.includes('__pycache__')&&!p.endsWith('.pyc')});
  }
  const now=new Date().toISOString();
  const meta={schema_version:'agency-artifact/1.0',artifact_id:'art_'+randomUUID(),artifact_type:'brief',title:'Моя задача',scope:'project',project_id:null,department:r.department.toLowerCase(),task_ref:{system:'external',id:'work/tasks/'+taskId+'/'},owner:{kind:'role',id:null},status:'draft',version:1,created_at:now,updated_at:now,access:'internal',review:null};
  fs.writeFileSync(path.join(target,'request.md'),'---\n'+Object.entries(meta).map(([k,v])=>k+': '+JSON.stringify(v)).join('\n')+'\n---\n\n# Моя задача\n\n'+r.request_fields.map(s=>'- '+s).join('\n')+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(target,'package.json'),JSON.stringify({schema_version:'agency-task-package/1.0',recipe_id:r.id,status:'draft',project_root:projectRoot,task_id:taskId,request_ref:'request.md',prompt_ref:'PROMPT.md',route_ref:r.journey_id?'route.json':null,source_repository:'https://github.com/VKirill/agency-router',bundle_version:'0.8.0',model:null,permissions:[]},null,2)+'\n',{flag:'wx'});
  console.log('Скопировано: '+target+'\nЗаполните request.md; агент читает PROMPT.md и _kit/README.md. Ничего не запущено.');
 }else throw new Error('Команды: list | find "название" | copy ID EXISTING_PROJECT TASK_ID');
}catch(e){console.error(e.message);process.exitCode=1;}
