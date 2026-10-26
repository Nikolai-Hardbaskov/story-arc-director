import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, parsePlot } from '../story-core.mjs';
import { requestStoryPlot } from '../plot-request.mjs';

const plot = {
    title:'Тёплый выходной', premise:'Пара давно вместе и планирует отдых',
    centralConflict:'Определиться с совместными планами', hiddenTruth:'Леон готовит сюрприз',
    resolution:'Пара завершает день вместе и договаривается о планах',
    acts:Array.from({length:5}, (_,i)=>({
        scene:`Сцена ${i + 1}`, goal:`Цель ${i + 1}`, obstacle:'Небольшое препятствие',
        clue:'Нежная деталь', bridge:'Следующий разговор'
    })),
};
const valid = JSON.stringify(plot);

test('accepts fenced output and explanatory prose without changing fields', () => {
    const parsed = parsePlot(`Вот история:\n\`\`\`json\n${valid}\n\`\`\`\nКонец.`);
    assert.deepEqual(parsed.acts.map(a => a.scene), plot.acts.map(a => a.scene));
});

test('handles escaped quotes and curly brackets in text fields', () => {
    const candidate = JSON.stringify({...plot, premise:'Леон говорит: "Я рядом {с тобой}"'});
    assert.equal(parsePlot(candidate).premise, 'Леон говорит: "Я рядом {с тобой}"');
});

test('rejects truncated JSON with a diagnostic rather than guessing missing story', () => {
    assert.throws(() => parsePlot(valid.slice(0, -50)), /обрезанный JSON/);
});

test('rejects invalid syntax instead of silently editing user-written content', () => {
    assert.throws(() => extractJsonObject('{"a": "b",}', 'План'), /неверный JSON/);
});

test('accepts a valid plan in one API call', async () => {
    let calls = 0;
    const result = await requestStoryPlot({prompt:'Создай план', generateRaw:async()=>{calls++;return valid;}});
    assert.equal(calls,1);
    assert.equal(result.attempts,1);
    assert.equal(result.plot.title, plot.title);
});

test('repairs a malformed JSON response with a second API call', async () => {
    const calls=[];
    const result=await requestStoryPlot({
        prompt:'Создай сюжет для пары',
        generateRaw:async request=>{calls.push(request);return calls.length===1 ? valid.replace('"title":','"title":\"\", "broken":') : valid;},
    });
    assert.equal(result.attempts,2);
    assert.equal(calls.length,2);
    assert.match(calls[1].prompt,/broken_json_data/);
});

test('truncated response regenerates compact plan instead of trying to copy incomplete acts',async()=>{
    const prompts=[];
    const result=await requestStoryPlot({
        prompt:'Создай сюжет для пары',
        generateRaw:async ({prompt})=>{prompts.push(prompt);return prompts.length===1?valid.slice(0,-200):valid;},
    });
    assert.equal(result.attempts,2);
    assert.match(prompts[1],/Shorten values without removing fields/);
    assert.doesNotMatch(prompts[1],/broken_json_data/);
});

test('falls back to a short new plan after failed JSON repair', async()=>{
    let calls=0;
    const reasons=[];
    const result=await requestStoryPlot({
        prompt:'Сюжет пары',
        onRetry:reason=>reasons.push(reason),
        generateRaw:async()=>{calls++;return calls<3 ? '{"title":\"\", "broken": true,}' : valid;}
    });
    assert.equal(result.attempts,3);
    assert.deepEqual(reasons,['repair','compact']);
});

test('never returns an unparsed or partial plan if all tries fail', async()=>{
    let calls=0;
    await assert.rejects(requestStoryPlot({
        prompt:'История',
        generateRaw:async()=>{calls++;return '{"title":"Сон", "acts": [';},
    }),/3000–4000/);
    assert.equal(calls,3);
});

test('propagates provider errors without needless automatic retries',async()=>{
    let calls=0;
    await assert.rejects(requestStoryPlot({
        prompt:'История', generateRaw:async()=>{calls++;throw Error('HTTP 429');}
    }),/HTTP 429/);
    assert.equal(calls,1);
});

test('refuses to accept two acts as a five-act story',async()=>{
    await assert.rejects(requestStoryPlot({
        prompt:'История',maxAttempts:1,
        generateRaw:async()=>JSON.stringify({...plot,acts:plot.acts.slice(0,2)}),
    }),/3000–4000/);
});
