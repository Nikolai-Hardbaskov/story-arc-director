import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCharacterFacts, validatePlotFit, generatePlannerPrompt,
         parsePlot, reconcileRelationship, buildInjection, ACT_NAMES } from '../story-core.mjs';
const card = {data:{description: `>PERSONALITY: Kind; generous; steadfastly loyal; responsible; romantic; affectionate; emotionally open.
>APPEARANCE: ${'Bright blue eyes, broad shoulders, handsome face, etc. '.repeat(40)}
>FEATURES: Mole on the right cheek.
>SPEECH: Sarcastic, speaks casually, uses modern language.
>RELATIONSHIPS: Had some experience but nothing truly serious. He engages in physical and intimate contact with his girlfriend. {{user}} is his girlfriend; they've been dating for quite some time and are in a serious relationship.
>CAREER: Young cop who recently started serving, believes in justice. He owns a black Jeep Wrangler.`}};
const facts = extractCharacterFacts(card,{charName:'Leon Kennedy',userName:'Вильгельмина'});
const act = (i) => ({scene:`Акт ${i}`,goal:'Побыть вместе и определиться с планами',obstacle:'Дождь и неожиданный звонок',clue:'Разговор о предстоящем отпуске',bridge:'Встреча с близкими'});
const plot = {title:'Выходные для двоих',premise:'Леон и его девушка Вильгельмина уже давно вместе и собираются провести выходные вдвоём.',centralConflict:'У них расходятся планы на выходные, нужно найти компромисс.',hiddenTruth:'Леон приготовил подарок.',resolution:'Пара договаривается о совместных планах.',acts:ACT_NAMES.map((_,i)=>act(i))};
test('late RELATIONSHIPS from long Description is prioritized and paired status detected',()=>{
  assert.ok(card.data.description.indexOf('{{user}} is his girlfriend')>1200);
  assert.equal(facts.relationship.kind,'established_couple');
  assert.ok(facts.canon.indexOf('RELATIONSHIPS')<facts.canon.indexOf('APPEARANCE'));
  assert.match(facts.canon,/they've been dating for quite some time/);
  assert.match(facts.canon,/Young cop/);
  assert.match(facts.canon,/steadfastly loyal/);
});
test('does not fabricate couple status when card only says he has a girlfriend',()=>{
  const sample=extractCharacterFacts({description:'{{char}} is happy with his girlfriend. {{user}} is a colleague.'});
  assert.equal(sample.relationship,null);
});
test('new plan must acknowledge confirmed current girlfriend rather than newcomers',()=>{
  assert.deepEqual(validatePlotFit(plot,{relationship:facts.relationship,genres:['romance','slice_of_life']}),[]);
  const wrong = structuredClone(plot);
  wrong.premise='Леон только устроился на работу и знакомится с Вильгельминой у стола с документами.';
  wrong.acts[0].goal='Познакомиться или наладить рабочий контакт';
  wrong.resolution='Коллеги постепенно становятся влюблённой парой.';
  const problems=validatePlotFit(wrong,{relationship:facts.relationship,genres:['romance','slice_of_life']});
  assert.ok(problems.length>=2,problems.join(';'));
});
test('genre quality gate rejects mystery-like sabotage when only romance and everyday life requested',()=>{
  const wrong=structuredClone(plot);
  wrong.premise+=' Из-за саботажа подделаны документы, начинается расследование.';
  wrong.centralConflict='Расследование фальсификации и разоблачение заговора.';
  assert.match(validatePlotFit(wrong,{relationship:facts.relationship,genres:['romance','slice_of_life']}).join(' '),/детективу/);
  assert.deepEqual(validatePlotFit(wrong,{relationship:facts.relationship,genres:['romance','slice_of_life','crime']}),[]);
});
test('review saying colleagues/strangers is rejected without confirmed breakup',()=>{
  const story={canonRelationshipStatus:facts.relationship.status,memory:{relationship:{status:facts.relationship.status,dynamics:'',changes:[],unresolved:[]}}};
  const review={relationship:{status:'коллеги / незнакомцы',dynamics:'говорят в офисе',changes:[],unresolved:[]},summary:'Она принесла документы',decisions:[],consequences:[]};
  assert.equal(reconcileRelationship(story,review).status,facts.relationship.status);
  const breakup={...review,summary:'После долгого разговора они расстались',relationship:{...review.relationship,status:'бывшие партнёры'}};
  assert.equal(reconcileRelationship(story,breakup).status,'бывшие партнёры');
});
test('romance plus slice-of-life prompt no longer demands antagonist or detective clues',()=>{
  const prompt=generatePlannerPrompt({genres:['romance','slice_of_life'],canon:facts.canon});
  assert.match(prompt,/НЕ заменяй это расследованием/);
  assert.match(prompt,/Антагонист НЕ обязателен/);
  assert.match(prompt,/подтверждай это в premise/);
  const inj=buildInjection({plot,genres:['romance','slice_of_life'],stageIndex:0,memory:{relationship:{status:facts.relationship.status}},canonRelationshipStatus:facts.relationship.status},facts.canon);
  assert.match(inj,/Исходный статус по карточке/);
  assert.match(inj,/they've been dating/);
});
