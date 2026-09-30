import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,byId,prompt} from './recipes.mjs';

const pages = {'/':'lab.html','/index.html':'index.html','/start.html':'start.html','/models.html':'models.html'};
const limits = {goal: 12000, materials: 120000, constraints: 4000};
const maxUpload=8*1024*1024,maxUploads=5,maxTotalUpload=20*1024*1024,maxOutput=25*1024*1024;
const replyJson=(res,status,data)=>res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(data));

function validateFiles(files){
 if(!Array.isArray(files)||files.length>maxUploads)throw Error(`Можно прикрепить не более ${maxUploads} файлов`);
 const seen=new Set();let total=0;
 return files.map(file=>{
  if(!file||typeof file.name!=='string'||!file.name||file.name.length>160||/[\\/\x00-\x1f\x7f]/.test(file.name)||file.name==='.'||file.name==='..')throw Error('Некорректное имя файла');
  if(seen.has(file.name))throw Error('Имена вложений должны различаться');seen.add(file.name);
  if(typeof file.base64!=='string'||file.base64.length>Math.ceil(maxUpload/3)*4+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64))throw Error(`Некорректное содержимое файла ${file.name}`);
  const bytes=Buffer.from(file.base64,'base64');total+=bytes.length;
  if(bytes.length>maxUpload||total>maxTotalUpload)throw Error('Превышен лимит вложений: 8 МиБ на файл, 20 МиБ суммарно');
  return {name:file.name,bytes};
 });
}

function collectOutputs(dir,files,servedRoot){
 const output=path.join(dir,'output'),found=[];
 if(!fs.existsSync(output)||!fs.lstatSync(output).isDirectory()||fs.lstatSync(output).isSymbolicLink())return found;
 const realOutput=fs.realpathSync(output);
 const walk=(folder,relative='',depth=0)=>{
  if(depth>8||found.length>=100)return;
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
   if(found.length>=100)break;
   const rel=path.join(relative,entry.name),full=path.join(folder,entry.name),stat=fs.lstatSync(full);
   if(stat.isSymbolicLink())continue;
   if(stat.isDirectory()){walk(full,rel,depth+1);continue;}
   if(!stat.isFile()||stat.size>maxOutput)continue;
   let handle;
   try{
    if(!fs.realpathSync(full).startsWith(realOutput+path.sep))continue;
    handle=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const opened=fs.fstatSync(handle);
    if(!opened.isFile()||opened.ino!==stat.ino||opened.dev!==stat.dev||opened.size>maxOutput)continue;
    const id=randomUUID(),name=rel.split(path.sep).join('/'),saved=path.join(servedRoot,id);
    fs.writeFileSync(saved,fs.readFileSync(handle),{flag:'wx',mode:0o600});
    files.set(id,{path:saved,name,size:opened.size});found.push({id,name,size:opened.size,url:`/api/files/${id}`});
   }catch{}finally{if(handle!==undefined)fs.closeSync(handle);}
  }
 };
 walk(output);return found;
}

function removeRunDir(dir){
 try{fs.rmSync(dir,{recursive:true,force:true});return true;}catch{}
 try{
  const unlock=folder=>{
   const stat=fs.lstatSync(folder);
   if(!stat.isDirectory()||stat.isSymbolicLink())return;
   fs.chmodSync(folder,0o700);
   for(const entry of fs.readdirSync(folder))unlock(path.join(folder,entry));
  };
  unlock(dir);
  fs.rmSync(dir,{recursive:true,force:true});
  return true;
 }catch(error){console.warn(`Не удалось удалить временную папку: ${error.message}`);return false;}
}

export function readLoginStatus(run=spawnSync){
 const result=run(process.env.AGENCY_CODEX_BIN||'codex',['login','status'],{encoding:'utf8'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('Не удалось проверить вход Codex CLI');
 return String(result.stdout||'')+'\n'+String(result.stderr||'');
}

export function createLabServer({runCommand=spawn,getLoginStatus=readLoginStatus}={}) {
 let busy = false,activeChild=null;
 const runDirs=new Set(),outputs=new Map(),servedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'agency-router-downloads-'));
 const killGroup=(child,signal)=>{
  if(child.pid&&process.platform!=='win32'){
   try{process.kill(-child.pid,signal);return;}catch{}
  }
  child.kill(signal);
 };
 const server = http.createServer(async (req,res)=>{
  const address = server.address();
  const host = `127.0.0.1:${address.port}`;
  if(req.headers.host !== host){res.writeHead(403).end('Forbidden');return;}
  if(req.method==='GET' && pages[req.url]){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
   fs.createReadStream(fileURLToPath(new URL(`../${pages[req.url]}`,import.meta.url))).pipe(res);return;
  }
  const fileId=req.url?.match(/^\/api\/files\/([0-9a-f-]{36})$/)?.[1];
  if(req.method==='GET'&&fileId){
   const file=outputs.get(fileId);
   if(!file){res.writeHead(404).end('Not found');return;}
   try{
    const stat=fs.lstatSync(file.path);
    if(!stat.isFile()||stat.size>maxOutput)throw Error('Недоступный файл');
    const bytes=fs.readFileSync(file.path);
    res.writeHead(200,{'content-type':'application/octet-stream','content-length':bytes.length,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file.name))}`,'cache-control':'no-store','x-content-type-options':'nosniff'}).end(bytes);
   }catch{res.writeHead(404).end('Not found');}
   return;
  }
  if(req.method!=='POST' || req.url!=='/api/run'){res.writeHead(404).end('Not found');return;}
  if(req.headers.origin!==`http://${host}` || !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){
   res.writeHead(403).end('Forbidden');return;
  }
  if(busy){replyJson(res,409,{error:'Уже идёт один запуск. Дождитесь его завершения.'});return;}
  let dir;
  try{
   let length=0;const chunks=[];
   for await(const chunk of req){length+=chunk.length;if(length>30*1024*1024)throw Error('Слишком большой запрос');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),recipe=byId[data.id];
   if(!recipe)throw Error('Неизвестный ID поручения');
   for(const [key,max] of Object.entries(limits))if(typeof data[key]!=='string'||data[key].length>max)throw Error(`Поле ${key} отсутствует или слишком длинное`);
   if(data.editedPrompt!==undefined&&(typeof data.editedPrompt!=='string'||data.editedPrompt.length>40000))throw Error('Редактируемый промпт слишком длинный');
   if(!data.goal.trim()&&!data.editedPrompt?.trim())throw Error('Опишите задачу или отредактируйте промпт перед запуском');
   const uploads=validateFiles(data.files??[]);
   if(busy){replyJson(res,409,{error:'Уже идёт один запуск. Дождитесь его завершения.'});return;}
   if(!getLoginStatus().includes('Logged in using ChatGPT'))throw Error('Для работы по подписке войдите в Codex CLI через ChatGPT: codex login');
   busy=true;
   dir=fs.mkdtempSync(path.join(os.tmpdir(),'agency-router-lab-'));runDirs.add(dir);
   fs.mkdirSync(path.join(dir,'input'));fs.mkdirSync(path.join(dir,'output'));
   for(const skill of ['model-task-prompts','agency-artifacts'])fs.cpSync(path.join(root,'skills',skill),path.join(dir,'skills',skill),{recursive:true});
   for(const file of uploads)fs.writeFileSync(path.join(dir,'input',file.name),file.bytes,{flag:'wx',mode:0o600});
   res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
   const emit=(type,value)=>{if(!res.destroyed)res.write(JSON.stringify({type,value})+'\n');};
   emit('status','Запускаю Codex…');
   const materialList=uploads.length?'\nПрикреплённые файлы в input/: '+uploads.map(f=>f.name).join(', '):'';
   const filled=data.editedPrompt?.trim()||prompt(recipe).replace('[опишите ситуацию и желаемый результат]',()=>data.goal.trim())
    .replace('[вставьте текст, ссылки, файлы или напишите «пока нет»]',()=>data.materials.trim()||'Пока нет')
    .replace('[срок, рынок, язык, формат — если известны]',()=>data.constraints.trim()||'Не заданы')
    .replace('[в чат / в выбранную папку проекта]','в ответ этой тестовой панели и файлы в output/');
   const instruction=filled+materialList+'\nРЕЖИМ ТЕСТА: Работай только внутри текущей временной папки. Прочитай вложения из input/. Нужные навыки этого пакета находятся в skills/. Все созданные файлы сохрани в output/ с понятными именами; перечисли их в ответе относительными путями output/..., без абсолютных путей временной папки. Ответ дай также текстом. Не изменяй input/, не отправляй сообщения, не публикуй и не выполняй действия с затратами. Если нужны недоступные входы или полномочия, покажи выполненную часть и назови конкретный пробел.\n';
   const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
   const child=runCommand(process.env.AGENCY_CODEX_BIN||'codex',['exec','--json','--ephemeral','--sandbox','workspace-write','--skip-git-repo-check','-C',dir,'--model','gpt-6.1-sol','-c','model_reasoning_effort="high"','-c','service_tier="default"','-c','agents.default_subagent_model="gpt-6.1-sol"','-c','agents.default_subagent_reasoning_effort="high"','-'],{cwd:dir,stdio:['pipe','pipe','pipe'],env,detached:process.platform!=='win32'});
   activeChild=child;
   let stdout='',stderr='',answer='',finished=false;
   const finish=(code,error)=>{
    if(finished)return;finished=true;busy=false;activeChild=null;
    let files=[];
    try{files=collectOutputs(dir,outputs,servedRoot);}catch(e){stderr=(stderr+' Не удалось собрать файлы: '+e.message).slice(-4000);}
    finally{if(removeRunDir(dir))runDirs.delete(dir);}
    if(files.length)emit('files',files);
    if(error)emit('error',error);
    else if(code===0&&(answer||files.length))emit('done',answer||'Файлы готовы.');
    else emit('error',stderr.trim()||`Codex завершился с кодом ${code}; ответа нет`);
    res.end();
   };
   child.stdout.on('data',chunk=>{
    stdout+=chunk.toString();
    let newline;
    while((newline=stdout.indexOf('\n'))!==-1){
     const line=stdout.slice(0,newline);stdout=stdout.slice(newline+1);
     try{
      const event=JSON.parse(line);
      if(event.type==='item.completed' && event.item?.type==='agent_message'){
       answer=event.item.text||answer;emit('answer',answer);
      }else if(event.type==='turn.started')emit('status','Codex работает над поручением…');
      else if(event.type==='error')emit('status',event.message||'Ошибка Codex');
     }catch{}
    }
    if(stdout.length>1000000)stdout='';
   });
   child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
   child.stdin.on('error',error=>{stderr=(stderr+error.message).slice(-4000);});
   child.on('error',error=>finish(null,`Не удалось запустить Codex CLI: ${error.message}`));
   child.on('close',code=>finish(code));
   res.on('close',()=>{if(!finished)server.stopActiveRun();});
   child.stdin.end(instruction);
  }catch(error){
   if(dir){if(removeRunDir(dir))runDirs.delete(dir);busy=false;}
   if(!res.headersSent)replyJson(res,400,{error:error.message});else res.end(JSON.stringify({type:'error',value:error.message})+'\n');
  }
 });
 server.stopActiveRun=()=>{
  const child=activeChild;if(!child)return;
  killGroup(child,'SIGTERM');
  setTimeout(()=>{if(activeChild===child)killGroup(child,'SIGKILL');},5000).unref();
 };
 server.on('close',()=>{for(const dir of runDirs)removeRunDir(dir);removeRunDir(servedRoot);outputs.clear();});
 return server;
}

if(process.argv[1] && fileURLToPath(import.meta.url)===fileURLToPath(new URL(`file://${process.argv[1]}`))){
 const port=Number(process.env.AGENCY_LAB_PORT||4317);
 const server=createLabServer();server.listen(port,'127.0.0.1',()=>console.log(`Панель тестирования: http://127.0.0.1:${port}/`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.stopActiveRun();server.close();});
}
