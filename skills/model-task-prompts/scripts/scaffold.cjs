'use strict';
const fs=require('node:fs'),path=require('node:path');
try{
 const [project,id,type]=process.argv.slice(2);
 if(!project||!fs.statSync(project).isDirectory()||!id||!type)throw Error('Usage: node scaffold.cjs EXISTING_PROJECT_ROOT TASK_ID TASK_TYPE');
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)||!/^[A-Z]+-\d{2}$/.test(type))throw Error('Некорректный task ID/type');
 const base=fs.realpathSync(project);let parent=base;
 for(const part of ['work','tasks']){parent=path.join(parent,part);if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('Symlink в пути задачи');if(fs.existsSync(parent)&&!fs.statSync(parent).isDirectory())throw Error('Путь не каталог');}
 const root=path.join(parent,id);if(fs.existsSync(root))throw Error('Задача уже существует; перезапись запрещена');

 const t=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/task.example.json'),'utf8'));
 t.id=id;t.type=type;t.storage.root=root;
 const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/agency-operating-model.json'),'utf8'));
 Object.assign(t,require('./project-context.js').forTask(spec,type));
 t.work_context.project_root=base;
 if(type!=='SEO-01'){t.goal='Определить цель из брифа';t.output='Определить результат из брифа';t.acceptance=['Определить наблюдаемые критерии из брифа'];t.constraints=[];t.tools=[];}
 fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(root);
 function write(name,value){fs.writeFileSync(path.join(root,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
 write('task.json',t);write('sources.json',{schema_version:'0.1',sources:[]});write('artifacts.json',{schema_version:'0.1',artifacts:[],accepted:[]});
 write('handoff.md','# Передача задачи\n\nСтатус: draft. Заполнить цель, входы, пути и привязки инструментов; данные ещё не собирались.\n');
 process.stdout.write(root+'\n');
}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
