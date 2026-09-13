import fs from 'node:fs';
import path from 'node:path';
import {root,model,routing,recipes,prompt} from './recipes.mjs';
const write=(p,s)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);};
const json=o=>JSON.stringify(o,null,2)+'\n';
const inline=o=>JSON.stringify(o).replace(/</g,'\\u003c');
const template=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=[];
for(const r of recipes){
 const prefix='prompts/'+r.id+'/';
 write(prefix+'PROMPT.md',`---\nschema_version: agency-artifact/1.0\nartifact_id: template_${r.id.toLowerCase()}\nartifact_type: instruction\ntitle: ${JSON.stringify(r.title)}\nscope: template\nproject_id: null\ndepartment: ${r.department}\ntask_ref: null\nowner: {kind: role, id: null}\nstatus: draft\nversion: 1\ncreated_at: "2026-09-14T00:00:00+02:00"\nupdated_at: "2026-09-14T00:00:00+02:00"\naccess: public\nreview: null\n---\n\n# ${r.title}\n\nСкопируйте текст ниже в чат и заполните блок «Мои данные».\n\n\`\`\`text\n${prompt(r)}\`\`\`\n`);
 write(prefix+'recipe.json',json(r));
 const copy=[{from:prefix+'PROMPT.md',to:'PROMPT.md'},{from:prefix+'recipe.json',to:'recipe.json'},
  {from:'skills/model-task-prompts',to:'_kit/skills/model-task-prompts'},
  {from:'skills/agency-artifacts',to:'_kit/skills/agency-artifacts'},
  {from:'docs/agent-handoff.md',to:'_kit/README.md'}];
 if(r.journey_id){const route=model.journeys.find(j=>j.id===r.journey_id);write(prefix+'route.json',json(route));copy.push({from:prefix+'route.json',to:'route.json'});}
 const manifest={schema_version:'agency-copy-manifest/1.0',recipe_id:r.id,copy,preparation_options:r.preparation_options,
  optional_skills:r.optional_skills,note:'Профильные навыки не входят в пакет. Проверить необходимость и наличие; не устанавливать всё автоматически. Ссылки на внешние поручения остаются в исходном репозитории; копировать их только если подготовка действительно нужна.'};
 write(prefix+'manifest.json',json(manifest));
 index.push({id:r.id,title:r.title,kind:r.kind,aliases:r.aliases,prompt:r.prompt_ref,recipe:r.recipe_ref,manifest:prefix+'manifest.json'});
}
write('prompts/index.json',json({schema_version:'agency-prompt-index/1.0',version:'0.7.0',items:index}));
const enriched={...model,outcomes:model.outcomes.map(o=>({...o,start_ref:'start.html?id='+o.id}))};
const blueprint=template('site-src/index.template.html').replace('BLUEPRINT_DATA',inline(enriched));
write('index.html',blueprint);
const map=template('site-src/models.template.html').replace('PROMPT_KIT',template('skills/model-task-prompts/scripts/prompt-kit.js')).replace('PAYLOAD',inline(routing)).replace('BLUEPRINT_JSON',inline(blueprint));
write('models.html',map);
write('start.html',template('site-src/start.template.html').replace('RECIPES_DATA',inline(recipes.map(r=>({...r,prompt:prompt(r)})))));
console.log(`${recipes.length} поручений; 80 результатов; 3 страницы собраны.`);
