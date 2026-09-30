'use strict';
const recipes=JSON.parse(document.getElementById('recipes').textContent),$=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const emptyAttachments='До 5 файлов: 8 МиБ каждый, 20 МиБ суммарно.';
let selected=recipes.find(r=>r.id===new URLSearchParams(location.search).get('id'))||recipes[0],controller=null,history=[],manualPrompt=false;
const drafts=new Map();

function readDetails(){return Object.fromEntries([...document.querySelectorAll('[data-detail]')].map(el=>[el.dataset.detail,el.value]));}
function values(){return {goal:$('goal').value,materials:$('materials').value,constraints:$('constraints').value,details:readDetails()};}
function saveDraft(){if(selected)drafts.set(selected.id,{...values(),editedPrompt:$('prompt-editor').value,manualPrompt});}
function makePrompt(recipe=selected){
 const v=values(),names=[...$('attachments').files].map(f=>f.name);
 const detailText=recipe.guide.fields.filter(f=>v.details[f.key]?.trim()).map(f=>`${f.label}: ${v.details[f.key].trim()}`);
 if(v.materials.trim())detailText.push(`Дополнительные материалы: ${v.materials.trim()}`);
 if(names.length)detailText.push('Прикреплённые файлы: '+names.join(', '));
 const materials=detailText.join('\n')||'Пока нет';
 return recipe.prompt.replace('[опишите ситуацию и желаемый результат]',()=>v.goal.trim()||'[опишите ситуацию и желаемый результат]')
  .replace('[вставьте текст, ссылки, файлы или напишите «пока нет»]',()=>materials)
  .replace('[срок, рынок, язык, формат — если известны]',()=>v.constraints.trim()||'Не заданы')
  .replace('[в чат / в выбранную папку проекта]','в ответ этой тестовой панели и файлы в output/');
}
function updatePrompt(force=false){
 if(force)manualPrompt=false;
 if(!manualPrompt)$('prompt-editor').value=makePrompt();
 $('prompt-state').textContent=manualPrompt?'Промпт изменён вручную. Поля выше не переписывают ваш текст.':'Промпт автоматически заполнен данными из полей выше.';
}
function showRecipe(){
 const r=selected,g=r.guide;
 $('guide').innerHTML=`<span class="pill">${r.kind==='outcome'?'Результат':'Операция'} · ${escapeHtml(r.id)}</span><h2>${escapeHtml(r.title)}</h2><p class="muted"><strong>На выходе</strong><br>${escapeHtml(r.output.join('; '))}</p>`;
 $('task-heading').textContent=r.title;
 $('start-hint').textContent=r.minimum_input;
 $('full-hint').textContent=g.fullResult;
 $('example-heading').textContent=g.exampleKind;
 $('example-text').textContent=g.example;
 $('goal-label').textContent=g.goalLabel;
 $('goal-hint').textContent=g.goalHint;
 $('materials-label').textContent=g.materialLabel;
 $('materials-hint').textContent=g.materialHint+' — напишите здесь, приложите файл или дайте разрешённую ссылку.';
 $('specific-fields').innerHTML=g.fields.map(f=>`<label for="detail-${escapeHtml(f.key)}">${escapeHtml(f.label)} <small>${f.essential?'· основа для полного результата':'· если известно'}</small></label><p class="field-hint">${escapeHtml(f.hint)}</p><textarea id="detail-${escapeHtml(f.key)}" data-detail="${escapeHtml(f.key)}" placeholder="Введите сведения или приложите файл ниже"></textarea>`).join('');
 $('attachments').value='';$('attached').textContent=emptyAttachments;
 const draft=drafts.get(r.id);
 for(const key of ['goal','materials','constraints'])$(key).value=draft?.[key]||'';
 for(const field of g.fields)document.getElementById(`detail-${field.key}`).value=draft?.details?.[field.key]||'';
 manualPrompt=Boolean(draft?.manualPrompt);
 $('prompt-editor').value=manualPrompt?draft.editedPrompt:makePrompt();
 updatePrompt();
}
function selectRecipe(id){
 const next=recipes.find(r=>r.id===id);if(!next||next.id===selected.id)return;
 saveDraft();selected=next;showRecipe();
}
function filter(){
 const q=$('find').value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
 const items=recipes.filter(r=>(r.id+' '+r.title+' '+r.aliases.join(' ')).toLocaleLowerCase('ru').replace(/ё/g,'е').includes(q));
 $('count').textContent=`Найдено ${items.length} из ${recipes.length}`;
 $('recipe').innerHTML=items.map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.id+' · '+r.title)}</option>`).join('');
 if(items.some(r=>r.id===selected.id))$('recipe').value=selected.id;
 else if(items.length){selectRecipe(items[0].id);$('recipe').value=selected.id;}
}
function setRunning(value){
 for(const id of ['run','recipe','find','attachments','goal','materials','constraints','prompt-editor','use-example','sync-prompt'])$(id).disabled=value;
 for(const field of document.querySelectorAll('[data-detail]'))field.disabled=value;
 $('cancel').disabled=!value;$('history').inert=value;
}
function renderFiles(files){$('files').innerHTML=files.length?files.map(f=>`<a href="${escapeHtml(f.url)}" download>${escapeHtml(f.name)} <small>(${(f.size/1024).toFixed(1)} КиБ)</small></a>`).join(''):'Агент не создал файлов в этом прогоне.';}
function readAttachment(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,base64:String(reader.result).split(',')[1]||''});reader.onerror=()=>reject(Error(`Не удалось прочитать ${file.name}`));reader.readAsDataURL(file);});}
function renderHistory(){if(!history.length)return;$('history').innerHTML=history.map((item,i)=>`<button data-index="${i}">${escapeHtml(item.id+' · '+item.title)}<small>${escapeHtml(item.date)} · ${item.ok?'готово':'ошибка'}</small></button>`).join('');}
function saveRun(recipe,ok,result,inputs,files,attachmentNames){history.unshift({id:recipe.id,title:recipe.title,date:new Date().toLocaleTimeString('ru'),ok,result,inputs,files,attachmentNames});renderHistory();}
async function run(){
 const goal=$('goal').value.trim(),materials=$('materials').value,constraints=$('constraints').value,editedPrompt=$('prompt-editor').value.trim();
 const selectedFiles=[...$('attachments').files],details=readDetails();
 if(!goal&&!manualPrompt&&!materials.trim()&&!selectedFiles.length&&!Object.values(details).some(value=>value.trim())){$('status').textContent='Заполните хотя бы одно поле, возьмите пример или отредактируйте промпт.';$('goal').focus();return;}
 if(!editedPrompt||editedPrompt.length>40000){$('status').textContent='Промпт пуст или длиннее 40 000 символов.';return;}
 const total=selectedFiles.reduce((n,f)=>n+f.size,0);
 if(selectedFiles.length>5||selectedFiles.some(f=>f.size>8*1024*1024)||total>20*1024*1024){$('status').textContent='Превышен лимит вложений: 5 файлов, 8 МиБ каждый, 20 МиБ суммарно.';return;}
 const inputs={goal,materials,constraints,details,editedPrompt,manualPrompt},recipe=selected,attachmentNames=selectedFiles.map(f=>f.name);
 saveDraft();controller=new AbortController();setRunning(true);$('response').textContent='';$('files').textContent='Файлы появятся после завершения прогона.';$('copy').disabled=true;$('status').textContent='Читаю вложения…';let result='',ok=false,files=[];
 try{
  const uploaded=await Promise.all(selectedFiles.map(readAttachment));if(controller.signal.aborted)throw new DOMException('Остановлено','AbortError');
  $('status').textContent='Запускаю Codex…';
  const response=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:recipe.id,goal,materials,constraints,editedPrompt,files:uploaded}),signal:controller.signal});
  if(!response.ok){const error=await response.json();throw Error(error.error||`HTTP ${response.status}`);}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;
   while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line)continue;const event=JSON.parse(line);
    if(event.type==='status')$('status').textContent=event.value;
    else if(event.type==='answer'){$('response').textContent=event.value;result=event.value;}
    else if(event.type==='files'){files=event.value;renderFiles(files);}
    else if(event.type==='done'){result=event.value;ok=true;}
    else if(event.type==='error')throw Error(event.value);
   }
  }
  if(!ok)throw Error('Codex не прислал завершённый ответ');$('response').textContent=result;$('copy').disabled=false;$('status').textContent='Готово.';
 }catch(error){result=error.name==='AbortError'?'Запуск остановлен.':error.message;$('response').textContent=result;$('status').textContent='Запуск не завершён.';}
 finally{if(!files.length)renderFiles([]);saveRun(recipe,ok,result,inputs,files,attachmentNames);controller=null;setRunning(false);}
}

$('find').oninput=filter;
$('recipe').onchange=()=>selectRecipe($('recipe').value);
for(const id of ['goal','materials','constraints'])$(id).oninput=()=>updatePrompt();
$('specific-fields').oninput=()=>updatePrompt();
$('attachments').onchange=()=>{$('attached').textContent=$('attachments').files.length?[...$('attachments').files].map(f=>`${f.name} · ${(f.size/1024).toFixed(1)} КиБ`).join(' · '):emptyAttachments;updatePrompt();};
$('use-example').onclick=()=>{$('goal').value=selected.guide.example;updatePrompt();$('goal').focus();};
$('prompt-editor').oninput=()=>{manualPrompt=true;updatePrompt();};
$('sync-prompt').onclick=()=>updatePrompt(true);
$('copy-prompt').onclick=async()=>{await navigator.clipboard.writeText($('prompt-editor').value);$('prompt-state').textContent='Промпт скопирован.';};
$('run').onclick=run;$('cancel').onclick=()=>controller?.abort();
$('copy').onclick=async()=>{await navigator.clipboard.writeText($('response').textContent);$('status').textContent='Ответ скопирован.';};
$('history').onclick=e=>{const b=e.target.closest('[data-index]');if(!b)return;const item=history[Number(b.dataset.index)];saveDraft();selected=recipes.find(r=>r.id===item.id);$('find').value='';filter();drafts.set(selected.id,item.inputs);showRecipe();$('attached').textContent=item.attachmentNames.length?`В прошлом прогоне: ${item.attachmentNames.join(', ')}. Для нового запуска выберите файлы снова.`:emptyAttachments;$('response').textContent=item.result;renderFiles(item.files);$('status').textContent=item.ok?'Сохранённый результат':'Сохранённая ошибка';$('copy').disabled=!item.ok;};
filter();showRecipe();
