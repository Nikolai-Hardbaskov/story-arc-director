import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generatePlannerPrompt, buildReplanPrompt, extractCharacterFacts, GENRE_GROUPS } from '../story-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = ['story-core.mjs','index.js','plot-request.mjs'].map(name => readFileSync(resolve(root, name), 'utf8')).join('\n');

test('production logic and prompts contain no example-character names', () => {
  assert.doesNotMatch(production, /(?:Леон|Вильгельмин|Kennedy|Wilhelmina)/i);
});

test('unrelated characters have their real identities and relationships in planner', () => {
  const character = {description: '>PERSONALITY: Мила весёлая путешественница.\n>RELATIONSHIPS: Мила и {{user}} впервые встретились в поезде.'};
  const facts = extractCharacterFacts(character, {charName:'Мила',userName:'Саша'});
  const prompt = generatePlannerPrompt({genres:['romance','slice_of_life'], canon:facts.canon, context:'Саша сел в вагон.'});
  assert.match(prompt, /Мила/);
  assert.match(prompt, /Саша/);
  assert.doesNotMatch(prompt, /Вильгельмин|Леон/);
  assert.match(prompt, /otherwise do not invent a shared romantic history/);
  assert.match(prompt, /otherwise do not invent a shared romantic history/);
});

test('replanning uses player/character placeholders with no fixed names', () => {
  const story = { stageIndex: 1, plot: {title:'Встреча в поезде',acts:Array.from({length:5},()=>({scene:'Вагон',goal:'Общение',obstacle:'Задержка',clue:'Билет',bridge:'Пересадка'}))}, genres:['romance'],memory:{}};
  const prompt = buildReplanPrompt(story, 'Пассажир вышел раньше', 'Имя {{char}}: Мила\nИмя {{user}}: Саша');
  assert.match(prompt, /Мила/);
  assert.match(prompt, /Саша/);
  assert.doesNotMatch(prompt, /Леон|Вильгельмин/);
});

test('expanded catalogue keeps legacy genre ids valid', () => {
  const all = GENRE_GROUPS.flatMap(group => group.items.map(([id]) => id));
  assert.equal(GENRE_GROUPS.length, 10);
  assert.equal(all.length, 113);
  assert.equal(new Set(all).size, 113);
  for (const legacyId of ['romance','slice_of_life','sport','workplace','erotica','fantasy','superheroes','politics','tragedy']) {
    assert.ok(all.includes(legacyId), legacyId);
  }
});
