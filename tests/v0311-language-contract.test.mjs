import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GENRE_LIMIT, ACT_NAMES, CHARACTER_AGENCY_POLICY,
    buildGenreSuggestionPrompt, generatePlannerPrompt, buildInjection,
    buildReviewPrompt, buildReplanPrompt, parsePlot, parseReview,
} from '../story-core.mjs';
import { requestStoryPlot } from '../plot-request.mjs';
import { getActivePersona } from '../persona-context.mjs';

const plot = {
    title:'Уютный вечер', premise:'Пара готовится к свободному вечеру', centralConflict:'Согласовать свои планы',
    hiddenTruth:'У персонажа есть небольшой сюрприз', resolution:'Возможный спокойный совместный вечер',
    acts:ACT_NAMES.map((_, i) => ({scene:`Ситуация ${i+1}`,goal:`Возможность ${i+1}`,
        obstacle:'Небольшая бытовая помеха', clue:'Наблюдение', bridge:'Естественный следующий момент'})),
};
const story = {
    plot, genres:['romance','slice_of_life'], stageIndex:0, paused:false, completed:false,
    memory:{summary:'Они обсуждали вечер',decisions:[],consequences:[],openThreads:[]},
};

test('all five model-facing instruction paths use English rules while requiring Russian content', () => {
    const prompts = [
        buildGenreSuggestionPrompt({idea:'Уютная история'}),
        generatePlannerPrompt({genres:['romance','slice_of_life'],idea:'Семейный вечер'}),
        buildInjection(story),
        buildReviewPrompt(story,[]),
        buildReplanPrompt(story,'Планы изменились'),
    ];
    const beginnings = [
        'Suggest 1–8 genre IDs', 'Create an ORIGINAL', '[STORY ARC DIRECTOR — PRIVATE GUIDANCE',
        'You are an independent', 'Replan only the remaining',
    ];
    prompts.forEach((prompt,i)=>assert.ok(prompt.startsWith(beginnings[i]), `${i}: ${prompt.slice(0,90)}`));
    assert.match(prompts[0],/reason written in Russian/);
    assert.match(prompts[1],/OUTPUT LANGUAGE: Russian/);
    assert.match(prompts[2],/ROLEPLAY LANGUAGE: Continue \{\{char\}\}'s dialogue and narration in Russian/);
    assert.match(prompts[3],/natural-language JSON values.*MUST be in Russian/);
    assert.match(prompts[4],/human-readable JSON values MUST be written in Russian/);
    assert.match(prompts[2],/Do not mechanically end each reply with a question/);
    assert.match(prompts[2],/Do NOT change the act on your own/);
    assert.match(prompts[2],/NEVER author \{\{user\}\}'s dialogue/);
    assert.ok(prompts.slice(1).every(v => v.includes(CHARACTER_AGENCY_POLICY)));
});

test('valid old Russian plots and review memories remain readable without migration', () => {
    assert.deepEqual(parsePlot(JSON.stringify(plot)), plot);
    const review = parseReview(JSON.stringify({
        sceneComplete:false,endingComplete:false,confidence:0.8,
        reason:'Действия ещё не завершены',summary:'Персонажи разговаривали',decisions:[],consequences:[],
        openThreads:[],deviation:'none',deviationReason:'',
        progress:{confirmed:['Разговор начался'],pending:['Обсудить вечер'],nextOpportunity:'Персонаж может подать чай'},
        relationship:{status:'Пара вместе',dynamics:'Поддерживают друг друга',changes:[],unresolved:[]},
    }));
    assert.equal(review.progress.nextOpportunity,'Персонаж может подать чай');
    assert.equal(review.relationship.status,'Пара вместе');
    assert.equal(GENRE_LIMIT,8);
});

test('planning and JSON-format recovery system prompts use English but keep Russian plan fields', async () => {
    const calls=[];
    const result=await requestStoryPlot({ generateRaw: async opt => {
        calls.push(opt);
        return calls.length===1 ? JSON.stringify(plot).slice(0,-40) : JSON.stringify(plot);
    },prompt:generatePlannerPrompt({genres:['romance','slice_of_life']}) });
    assert.equal(result.attempts,2);
    assert.equal(result.plot.title,'Уютный вечер');
    assert.match(calls[0].systemPrompt,/All human-readable JSON values must be in Russian/);
    assert.match(calls[1].prompt,/FORMAT PRIORITY/);
    assert.match(calls[1].prompt,/RUSSIAN sentence/);
    assert.doesNotMatch(calls[1].prompt,/ВАЖНО ДЛЯ ФОРМАТА ОТВЕТА/);
});

test('active persona description and facts can be Russian without converting model instructions', () => {
    const persona=getActivePersona({name1:'Мира',powerUserSettings:{persona_description:'Любит рисовать, давно встречается с персонажем.'}});
    assert.match(persona.canon,/ACTIVE \{\{user\}\} PERSONA/);
    assert.match(persona.canon,/Любит рисовать/);
    assert.match(persona.canon,/NEVER permission to act for the player/);
});

test('visible settings, README and manifest all use the same Russian-facing release number', () => {
    const base=resolve(fileURLToPath(new URL('..', import.meta.url)));
    const manifest=JSON.parse(readFileSync(resolve(base,'manifest.json'),'utf8'));
    const settings=readFileSync(resolve(base,'settings.html'),'utf8');
    const readme=readFileSync(resolve(base,'README.md'),'utf8');
    assert.equal(manifest.version,'0.3.11');
    assert.match(settings,/Сюжетный режиссёр v0\.3\.11/);
    assert.match(readme,/^# Story Arc Director v0\.3\.11/);
    assert.match(settings,/Выбор жанров|Жанры/);
});
