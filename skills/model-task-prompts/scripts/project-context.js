(function(root){
'use strict';
function forTask(spec,type){
 const d=spec.departments.find(d=>d.id===type.split('-')[0]);if(!d)throw Error('Нет направления для '+type);
 const knowledge=Object.fromEntries(spec.knowledge.map(k=>[k.key,k]));
 let workspace=d.path,reads=[...d.reads];
 if(type==='BRIEF-03')workspace='calls/<call-id>/';
 if(type==='DESIGN-01')reads.push('design.research');
 if(['DESIGN-04','DESIGN-05','DESIGN-08'].includes(type))reads.push('design.system');
 const requirements=reads.map(key=>({key,path:knowledge[key].path,owner_role:knowledge[key].owner_role,required:true,status:'unverified',version:null,purpose:knowledge[key].purpose}));
 const gates=[{id:'inputs',kind:'input',phase:'entry',status:'pending',criterion:'Прочитаны нужные принятые версии; пробелы стали зависимыми задачами; независимую работу можно продолжать.'}];
 if(type==='DESIGN-01')gates.push({id:'competitor-research',kind:'quality',phase:'entry',status:'pending',criterion:'Новое направление: обычно 5 релевантных DESIGN.md с evidence и сравнительной сводкой, либо документированное исключение. Принятый актуальный разбор переиспользовать.'});
 const editorial=['CONTENT-01','CONTENT-02','CONTENT-05','CONTENT-08'].includes(type)?{handoff_contract:{deliverables:['article/page text','visual-plan.json','visual-briefs.md'],image_count:'0..N, justified; no fixed quota',decision_basis:'reader job + available SERP/competitor evidence or editorial_judgment',review:'text and visual plan together; named reviewer and independent/self mode',slot_fields:['slot_id','anchor','purpose','rationale','brief','desktop alignment/width/wrap','mobile order/width/wrap/crop','caption','alt','article_revision','plan_revision'],no_images:'slots=[] + reason/review; skip designer and proceed to layout',final_check:'rendered desktop/mobile page; versioned text/plan/asset links'}}:{};
 return {...editorial,contract_version:'0.2',work_context:{path_base:'project-root',entrypoint:'PROJECT.md → project.json → knowledge_refs',department:d.id,workspace,task_record:'work/tasks/<task-id>/',result_policy:'Канонический результат в папке направления; в task artifacts.json ссылки на path/version/hash, не вторая копия.',owner_role:d.owner_role},context_requirements:requirements,skills:[...d.skills.map(s=>({...s})),{name:'agency-artifacts',when:'Создание рабочего MD/JSON: метаданные по формату; raw и закрытые схемы сохраняются',status:'candidate_verify_at_run'}],gates};
}
const api={forTask};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ProjectContext=api;
})(typeof globalThis!=='undefined'?globalThis:this);
