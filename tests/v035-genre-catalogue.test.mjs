import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  GENRE_GROUPS, GENRES, GENRE_LIMIT, normalizeGenres, storyGenres,
  genreDescription, parseGenreSuggestion, generatePlannerPrompt,
} from '../story-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = ['romance','dark_romance','erotica','romcom','slow_burn','relationship_drama',
  'slice_of_life','drama','comedy','family','sport','school','workplace','psychological',
  'horror','mystery','thriller','crime','mysticism','survival','tragedy','fantasy',
  'dark_fantasy','urban_fantasy','isekai','scifi','cyberpunk','postapocalypse',
  'superheroes','adventure','action','historical','politics','military'];

test('v0.3.6 offers 10 groups and 113 unique genres, preserving every old id', () => {
  assert.equal(GENRE_LIMIT, 8);
  assert.equal(GENRE_GROUPS.length, 10);
  assert.equal(Object.keys(GENRES).length, 113);
  const names = GENRE_GROUPS.map(group => group.title);
  assert.equal(new Set(names).size, 10);
  for (const id of legacy) assert.ok(Object.hasOwn(GENRES, id), `Lost old genre: ${id}`);
  for (const id of ['high_fantasy','sword_sorcery','situational_comedy','erotic_romance','university','sports_drama']) {
    assert.ok(Object.hasOwn(GENRES, id), `Missing requested direction: ${id}`);
  }
});

test('manual selection preserves eight, removes duplicates, rejects ninth, keeps old stories', () => {
  const eight = ['romance','slice_of_life','comedy','high_fantasy','adventure','sport','horror','crime'];
  assert.deepEqual(normalizeGenres([...eight,'fantasy','romance','unknown']), eight);
  assert.deepEqual(storyGenres({ genres: eight }), eight);
  assert.deepEqual(storyGenres({ genre: 'sport' }), ['sport']);
  assert.deepEqual(normalizeGenres([]), []);
  assert.deepEqual(normalizeGenres('auto'), []);
  assert.match(genreDescription(eight), /Высокое фэнтези/);
});

test('suggestion validator supports up to eight nonduplicate known genres', () => {
  const values = ['romance','slice_of_life','comedy','fantasy','historical','sport','horror','crime'];
  assert.deepEqual(parseGenreSuggestion(JSON.stringify({genres:values,reason:'Подходит идее'})).genres,values);
  assert.throws(() => parseGenreSuggestion(JSON.stringify({genres:[...values,'mystery'],reason:'wrong'})),/1–8/);
  assert.throws(() => parseGenreSuggestion(JSON.stringify({genres:['romance','romance'],reason:'wrong'})),/1–8/);
});

test('multi-genre planner respects main focus, player agency and no forced genre everywhere', () => {
  const prompt = generatePlannerPrompt({ genres: ['romance','slice_of_life','sport','comedy','adventure','historical','fantasy','horror'] });
  assert.match(prompt,/восьми жанров/);
  assert.match(prompt,/не пытайся использовать все восемь в каждом акте/);
  assert.match(prompt,/не подменяй уютную повседневность/i);
  assert.match(prompt,/Не приписывай пользователю конкретных поступков/i);
});

test('manifest, visible heading, readme match in v0.3.9 and no atmosphere controls', () => {
  const manifest = JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
  const html = readFileSync(resolve(root,'settings.html'),'utf8');
  const readme = readFileSync(resolve(root,'README.md'),'utf8');
  assert.equal(manifest.version,'0.3.9');
  assert.match(html,/Сюжетный режиссёр v0\.3\.9/);
  assert.ok(readme.startsWith('# Story Arc Director v0.3.9'));
  assert.match(html,/до восьми жанров/i);
  assert.match(html,/sad-genre-search/);
  assert.doesNotMatch(html,/sad-atmosphere|Выбор атмосферы/);
});
