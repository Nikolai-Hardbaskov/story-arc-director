import test from 'node:test';
import assert from 'node:assert/strict';
import { getActivePersona, personaMatches, compactPersonaDescription } from '../persona-context.mjs';
import { parseReview, applyReview, buildReviewPrompt, buildInjection, generatePlannerPrompt } from '../story-core.mjs';
const makeContext = (name, description, others={}) => ({
    name1:name, powerUserSettings: {
        persona_description:description,
        persona_descriptions: {...others},
    },
});
const plot = { title:'История',premise:'Встреча',centralConflict:'Организовать выходной',hiddenTruth:'Сюрприз',resolution:'Вечер вдвоём', acts:Array.from({length:5}, (_,i)=>({scene:'Гостиная',goal:'Совместные планы',obstacle:'Дождь',clue:'Сумка',bridge:'Варианты вечера'}))};
const story = {plot, stageIndex:0, mode:'smart', memory:{summary:'',decisions:[],consequences:[],openThreads:[]}, reviewLog:[], atAssistantCount:0};
function reviewData(progress={confirmed:['Герой предложил прогулку'],pending:['Ответ игрока пока неизвестен'],nextOpportunity:'Герой может предложить чай'}) { return {
  sceneComplete:false,endingComplete:false,confidence:0.92,reason:'События пока не завершены',summary:'Герой предложил прогулку',
  decisions:[],consequences:[],openThreads:[],deviation:'none',deviationReason:'',
  relationship:{status:'',dynamics:'',changes:[],unresolved:[]},progress,
}; }
test('only active persona description is read (other persona cards never leak)',()=>{
  const ctx=makeContext('Мира','Любит вышивать и пить чай',{'other.png':{description:'СЕКРЕТ ДРУГОЙ ПЕРСОНЫ'}});
  const value=getActivePersona(ctx);
  assert.match(value.canon,/Мира/);
  assert.match(value.canon,/Любит вышивать/);
  assert.doesNotMatch(value.canon,/СЕКРЕТ/);
  assert.doesNotMatch(generatePlannerPrompt({canon:value.canon}),/СЕКРЕТ/);
});
test('switching active persona changes binding and prevents use of old story',()=>{
  const a=getActivePersona(makeContext('Мира','Живёт у моря'));
  const b=getActivePersona(makeContext('Даша','Живёт в горах'));
  assert.ok(personaMatches({...story,personaBinding:a.binding},a));
  assert.equal(personaMatches({...story,personaBinding:a.binding},b),false);
  assert.equal(personaMatches(story,b),true); // backwards compatibility for old stories
  assert.notEqual(a.binding,b.binding);
  assert.doesNotMatch(a.binding,/Живёт у моря/);
});
test('older or minimal persona gives name but never steals other descriptions',()=>{
  const value=getActivePersona(makeContext('Игрок','',{'other.png':{description:'ОЧЕНЬ СЕКРЕТНО'}}));
  assert.match(value.canon,/No active persona description is available/);
  assert.doesNotMatch(value.canon,/ОЧЕНЬ СЕКРЕТНО/);
});
test('scene analysis includes only confirmed events and possible NPC action',()=>{
  const data = parseReview(JSON.stringify(reviewData()));
  const updated = applyReview(story,data,1,'hash');
  assert.deepEqual(updated.actProgress.confirmed,['Герой предложил прогулку']);
  assert.deepEqual(updated.actProgress.pending,['Ответ игрока пока неизвестен']);
  assert.equal(updated.actProgress.nextOpportunity,'Герой может предложить чай');
  assert.match(buildInjection(updated,'Имя игрока: Мира'),/Confirmed events in this act/);
  assert.match(buildReviewPrompt(updated,[],''),/progress.confirmed/);
});
test('an act transition records reason and resets current-act checks without losing memory',()=>{
  const complete = parseReview(JSON.stringify({...reviewData(),sceneComplete:true,confidence:0.94}));
  const updated=applyReview(story,complete,1,'hash');
  assert.equal(updated.stageIndex,1);
  assert.deepEqual(updated.actProgress.confirmed,[]);
  assert.equal(updated.actProgress.stageIndex,1);
  assert.equal(updated.lastTransition.reason,'События пока не завершены');
  assert.equal(updated.memory.summary,'Герой предложил прогулку');
});
test('older model response without progress fields remains accepted',()=>{
  const old=reviewData(); delete old.progress;
  const parsed=parseReview(JSON.stringify(old));
  assert.deepEqual(parsed.progress,{confirmed:[],pending:[],nextOpportunity:''});
});
test('progress rejects invalid values rather than putting model object in UI',()=>{
  const bad=reviewData();bad.progress={confirmed:'not an array'};
  assert.throws(()=>parseReview(JSON.stringify(bad)),/должен быть массивом/);
});
test('persona source is explicitly treated as non-controlling biographical context',()=>{
  const canon=getActivePersona(makeContext('Мира','Пуглива, боится высоты')).canon;
  const prompt=generatePlannerPrompt({canon,genres:['romance'],context:''});
  assert.match(prompt,/NEVER determine \{\{user\}\}/i);
  assert.match(prompt,/Мира/);
});

test('long persona card prioritizes a relationship near the end instead of truncating it',()=>{
  const description = `APPEARANCE: ${'внешность, '.repeat(700)}\nRELATIONSHIPS: {{char}} — супруг {{user}}. Они женаты.\nPERSONALITY: Спокойная, заботливая.`;
  const persona=getActivePersona(makeContext('Мира',description));
  assert.match(persona.canon,/супруг/);
  assert.match(persona.canon,/Спокойная/);
  assert.ok(persona.canon.length < 3000);
  assert.match(compactPersonaDescription(description),/RELATIONSHIPS/);
});
test('long unstructured persona retains both beginning and end',()=>{
  const data='Начало биографии '+ 'a'.repeat(5000) +' важная информация о семье';
  const compact=compactPersonaDescription(data);
  assert.match(compact,/Начало биографии/);
  assert.match(compact,/важная информация о семье/);
});
