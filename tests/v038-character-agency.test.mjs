import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ACT_NAMES, CHARACTER_AGENCY_POLICY, validateCharacterAgency, validatePlotFit,
  generatePlannerPrompt, buildInjection, buildReviewPrompt, buildReplanPrompt,
} from '../story-core.mjs';

const makePlot = (overrides = {}) => ({
  title: 'История характеров',
  premise: 'Двое давно знакомы, но смотрят на важный вопрос по-разному.',
  centralConflict: 'Понять друг друга, не теряя собственные границы.',
  hiddenTruth: 'У обоих есть объяснимые мотивы.',
  resolution: 'Они обсудят разногласия, итог зависит от реально совершённых решений.',
  acts: ACT_NAMES.map((_, i) => ({
    scene: 'Обычная совместная жизнь.', goal: 'Обсудить общую ситуацию.',
    obstacle: 'Разные приоритеты.', clue: 'Подтверждённые события важнее предположений.',
    bridge: `{{char}} может предложить обсудить следующий шаг ${i + 1}.`,
  })), ...overrides,
});
const story = { plot:makePlot(), stageIndex:1, genres:['romance','slice_of_life'],memory:{},paused:false,completed:false };

test('shared policy protects both character independence and player freedom', () => {
  assert.match(CHARACTER_AGENCY_POLICY, /мотивами, желаниями/);
  assert.match(CHARACTER_AGENCY_POLICY, /вправе соглашаться, отказывать, спорить/);
  assert.match(CHARACTER_AGENCY_POLICY, /НЕ обязательны/);
  assert.match(CHARACTER_AGENCY_POLICY, /не получает права писать реплики/);
  assert.doesNotMatch(CHARACTER_AGENCY_POLICY, /Леон|Вильгельмин|отмен[а-я]* поездк/i);
});

test('all four operating stages carry character agency safeguards', () => {
  for (const [stage, prompt] of [
    ['planning',generatePlannerPrompt({genres:['romance','slice_of_life']})],
    ['playing',buildInjection(story,'Карточка: персонаж заботливый и независимый.')],
    ['reviewing',buildReviewPrompt(story,[], 'Черты персонажа')],
    ['replanning',buildReplanPrompt(story,'Произошло изменение событий','Черты персонажа')],
  ]) {
    assert.ok(prompt.includes(CHARACTER_AGENCY_POLICY), `${stage} lost agency policy`);
    assert.match(prompt,/не заставляй|Не заставляй/);
    assert.match(prompt,/не.*навязывай|не.*называй|не создавай|Не создавай/);
  }
});

test('strong out-of-character unconditional obedience is rejected before save', () => {
  const bad = makePlot({ resolution:'{{char}} всегда соглашается с любыми требованиями игрока.' });
  assert.match(validateCharacterAgency(bad).join(' '),/безусловное послушание/);
  assert.match(validatePlotFit(bad).join(' '),/безусловное послушание/);
  const alsoBad = makePlot();
  alsoBad.acts[2].bridge = 'Персонаж безоговорочно подчиняется чужой воле и продолжает действие.';
  assert.match(validateCharacterAgency(alsoBad).join(' '),/Акт 3, bridge/);
});

test('normal consent, disagreement, forgiveness or sincere flexibility remain valid', () => {
  for (const resolution of [
    '{{char}} соглашается с конкретной идеей, потому что она ему самому нравится.',
    '{{char}} отказывает и спокойно объясняет свои границы.',
    '{{char}} может простить обиду после разговора, если захочет.',
    '{{char}} внимательно выслушивает, и решение остаётся открытым.',
  ]) assert.deepEqual(validateCharacterAgency(makePlot({resolution})),[],resolution);
});

test('card explicitly specifying unusual compliance has higher priority than generic heuristic', () => {
  const unusual = '{{char}} всегда соглашается с любыми требованиями игрока.';
  assert.deepEqual(validateCharacterAgency(makePlot({resolution:unusual}),{canon:unusual}),[]);
});

test('replanning validates only upcoming acts while existing history stays unchanged', () => {
  const p = makePlot();
  p.acts[0].bridge = '{{char}} всегда соглашается с любыми приказами игрока.';
  assert.ok(validateCharacterAgency(p).length);
  assert.deepEqual(validateCharacterAgency(p,{fromAct:1}),[]);
});

test('generation and replanning both pass canonical source to the quality gate', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const index = readFileSync(resolve(root, 'index.js'), 'utf8');
  assert.match(index,/charName: ctx\.name2 \|\| ''/);
  assert.match(index,/canon: getCombinedCanon\(ctx\)/);
  assert.match(index,/canon: getCanonForStory\(reviewed, ctx\)/);
});
