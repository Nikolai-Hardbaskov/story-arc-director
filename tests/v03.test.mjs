import test from 'node:test';
import assert from 'node:assert/strict';
import {
    GENRES, GENRE_LIMIT, GENRE_GROUPS, normalizeGenres, storyGenres,
    genreDescription, buildGenreSuggestionPrompt, parseGenreSuggestion,
    generatePlannerPrompt, parseReview, applyReview, buildReviewPrompt,
    buildReplanPrompt, buildInjection, ACT_NAMES,
} from '../story-core.mjs';

const plot = {
    title: 'Разговор после матча', premise: 'Герои уже вместе',
    centralConflict: 'Решить совместную задачу', hiddenTruth: 'Друг скрыл ошибку',
    resolution: 'Герои разбираются с последствиями',
    acts: ACT_NAMES.map((_,i) => ({scene:`Сцена ${i}`,goal:`Цель ${i}`,obstacle:'Препятствие',clue:'Улика',bridge:'Переход'})),
};
const coupleCanon = 'По карточке {{char}} уже парень {{user}}. {{char}} — спортсмен и заботливый, застенчивый человек.';
const story = (props = {}) => ({
    plot, genres:['romance','slice_of_life'], stageIndex:0, mode:'smart',
    paused:false, completed:false, memory:{summary:'Они уже встречаются.',decisions:[],consequences:[],openThreads:[]},
    ...props,
});
const analysis = {
    sceneComplete:false,endingComplete:false,confidence:.9,reason:'Поговорили о матче',
    summary:'Вечером пара обсудила тренировки.',decisions:[],consequences:[],openThreads:[],
    deviation:'none',deviationReason:'',
    relationship:{status:'Они уже пара',dynamics:'Заботятся друг о друге',changes:['Поддержал после матча'],unresolved:['Не обсудили отпуск']},
};

test('genre groups are unique, contain requested examples, and have an eight-genre limit', () => {
    const all = GENRE_GROUPS.flatMap(g=>g.items.map(([id])=>id));
    assert.equal(all.length, new Set(all).size);
    assert.equal(all.length, Object.keys(GENRES).length);
    for (const id of ['sport','erotica','dark_romance','romance','slice_of_life','horror','drama','fantasy','superheroes']) {
        assert.ok(all.includes(id), id);
    }
    assert.equal(GENRE_LIMIT, 8);
});

test('normalizing multiple genres supports auto and v0.2 single-select migration', () => {
    assert.deepEqual(normalizeGenres('auto'), []);
    assert.deepEqual(normalizeGenres(['romance','slice_of_life','romance','invalid']), ['romance','slice_of_life']);
    assert.deepEqual(storyGenres({ genre:'mystery' }), ['mystery']);
    assert.deepEqual(storyGenres({ genres:[], genre:'romance' }), []);
    assert.deepEqual(normalizeGenres(Object.keys(GENRES)).length, GENRE_LIMIT);
    assert.match(genreDescription([]), /Профессия.*контекст/);
});

test('genre suggestions are strict IDs and keep names grounded', () => {
    const prompt = buildGenreSuggestionPrompt({context:coupleCanon,idea:'уютная прогулка'});
    assert.match(prompt,/спортсмен/);
    assert.match(prompt,/sport: Спорт/);
    const result = parseGenreSuggestion('```json\n{"genres":["romance","slice_of_life"],"reason":"Герои уже вместе"}\n```');
    assert.deepEqual(result.genres,['romance','slice_of_life']);
    assert.throws(()=>parseGenreSuggestion(JSON.stringify({ genres: ['auto'], reason: 'wrong' })),/1–8/);
    assert.throws(()=>parseGenreSuggestion(JSON.stringify({ genres: ['sport','sport'], reason: 'wrong' })),/1–8/);
    assert.throws(()=>parseGenreSuggestion(JSON.stringify({ genres: [], reason: 'empty' })),/1–8/);
});

test('planner prioritizes couple status, character and agency over genre or profession', () => {
    const prompt = generatePlannerPrompt({genres:['romance','horror'],context:'Они пришли домой с соревнований.',canon:coupleCanon});
    assert.match(prompt,/романтика \+ Ужасы/i);
    assert.match(prompt,/профессия.*НЕ диктует жанр/i);
    assert.match(prompt,/НЕ сбрасывай эти отношения/i);
    assert.match(prompt,/{{char}} уже парень {{user}}/);
    assert.match(prompt,/не делай измену/i);
    assert.match(prompt,/совершеннолетних/);
    const auto = generatePlannerPrompt({genres:[],canon:coupleCanon});
    assert.match(auto,/Автоматически подбери/);
    assert.doesNotMatch(prompt,/выберите атмосферу/i);
});

test('memory stores actual relationship observations without losing them to legacy review response', () => {
    const old = story();
    const reviewed = parseReview(JSON.stringify(analysis));
    assert.deepEqual(reviewed.relationship.changes,['Поддержал после матча']);
    const newer = applyReview(old,reviewed,1,'f1');
    assert.equal(newer.memory.relationship.status,'Они уже пара');
    assert.match(buildInjection(newer,coupleCanon),/Они уже пара/);
    assert.match(buildInjection(newer,coupleCanon),/застенчивый/);
    const legacyReview = structuredClone(analysis);
    delete legacyReview.relationship;
    const again = applyReview(newer,parseReview(JSON.stringify(legacyReview)),2,'f2');
    assert.equal(again.memory.relationship.status,'Они уже пара');
    assert.equal(again.memory.relationship.changes[0],'Поддержал после матча');
});

test('review and branch prompts preserve established relationships, no forced athlete genre', () => {
    const s = story({ memory: {summary:'Пара уже вместе',relationship:{status:'Они пара',dynamics:'Поддерживают друг друга',changes:[],unresolved:[]}} });
    const review = buildReviewPrompt(s,[{is_user:false,mes:'{{char}} обнял {{user}}'}],coupleCanon);
    assert.match(review,/исходный статус отношений/i);
    assert.match(review,/relationship\.status/);
    assert.match(review,/застенчивый/);
    const replan = buildReplanPrompt(s,'Изменился план отпуска',coupleCanon);
    assert.match(replan,/измены и расставания не обязательны/i);
    assert.match(replan,/спортсмен не обязан/i);
    assert.match(replan,/канон/i);
});
