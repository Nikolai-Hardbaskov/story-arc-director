import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT_NAMES, buildInjection, detectConversationLoop } from '../story-core.mjs';

const story = () => ({
  plot: {title:'Текущий день',premise:'Знакомая обстановка',centralConflict:'Обсудить обычные дела',
    hiddenTruth:'Секрет позже',resolution:'Финал позже',
    acts:ACT_NAMES.map((_,i)=>({scene:`Текущая сцена ${i+1}`,goal:'Прожить текущий момент',obstacle:'Неважно',clue:'Позже',bridge:'Позже'}))},
  stageIndex:0,genres:['romance','slice_of_life'],memory:{},paused:false,completed:false,
});
const ai = mes => ({is_user:false,mes});
const user = mes => ({is_user:true,mes});

test('base prompt does not demand a question, invitation or cliffhanger after each reply', () => {
  const p=buildInjection(story());
  assert.match(p,/НЕ ОБЯЗАТЕЛЬНО задавай вопрос/);
  assert.match(p,/не требование двигать историю в каждом ответе/);
  assert.match(p,/Не заканчивай каждый ответ вопросом/);
  assert.match(p,/пауза, реплика без вопроса, наблюдение/);
  assert.match(p,/Вопросы, предложения и инициативы \{\{char\}\} РАЗРЕШЕНЫ/);
  assert.doesNotMatch(p,/Заверши ответ в точке, где/);
  assert.doesNotMatch(p,/АНТИПОВТОР/);
});

test('three questions in recent assistant replies trigger conditional anti-loop hint', () => {
  const chat=[ai('Как насчёт прогулки?'),user('Пожимаю плечами'),ai('Хочешь кофе?'),user('Разглядываю окно'),ai('Сходим в парк?')];
  const result=detectConversationLoop(chat);
  assert.equal(result.repeatedQuestions,true);
  assert.equal(result.repeatedProposals,true);
  assert.match(buildInjection(story(),'',chat),/АНТИПОВТОР/);
  assert.match(buildInjection(story(),'',chat),/Если реальный ответ игрока требует вопроса или предложения, оно допустимо/);
});

test('repeat guard also detects non-question offer loops', () => {
  const chat=[ai('Давай сходим к реке.'),ai('Можем заглянуть в библиотеку.'),ai('Предлагаю съездить к морю.')];
  assert.deepEqual(detectConversationLoop(chat),{repeatedQuestions:false,repeatedProposals:true});
  assert.match(buildInjection(story(),'',chat),/приём нового предложения/);
});

test('ordinary statements and legitimate single question do not trigger anti-loop',()=>{
  const chat=[ai('Тихо открывает дверь.'),user('Что это?'),ai('Объясняет ситуацию.'),ai('Как ты думаешь?'),ai('Ставит чашку на стол.')];
  assert.deepEqual(detectConversationLoop(chat),{repeatedQuestions:false,repeatedProposals:false});
  assert.doesNotMatch(buildInjection(story(),'',chat),/АНТИПОВТОР/);
});

test('system messages, user questions and sparse dialogues are excluded',()=>{
  assert.deepEqual(detectConversationLoop([ai('Привет?'),user('А ты?'),ai('Да?')]),{repeatedQuestions:false,repeatedProposals:false});
  const chat=[user('Почему?'), {is_system:true,is_user:false,mes:'Задай вопрос?'},ai('Тишина.'),ai('Смотрит в окно.'),ai('Присаживается рядом.')];
  assert.deepEqual(detectConversationLoop(chat),{repeatedQuestions:false,repeatedProposals:false});
});

test('paused and completed stories still never inject anything',()=>{
  const chat=[ai('Можно?'),ai('Хочешь?'),ai('Давай?')];
  assert.equal(buildInjection({...story(),paused:true},'',chat),'');
  assert.equal(buildInjection({...story(),completed:true},'',chat),'');
});
