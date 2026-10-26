import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ACT_NAMES, validatePlayerAgency, validatePlotFit, generatePlannerPrompt, buildReplanPrompt,
    buildReviewPrompt, buildInjection } from '../story-core.mjs';

const example = bridge => ({
    title: 'Выходные для двоих',
    premise: 'Леон и его девушка Вильгельмина давно вместе и обсуждают планы на выходные.',
    centralConflict: 'Согласовать небольшой совместный отдых.',
    hiddenTruth: 'Леон приготовил поездку в горы.',
    resolution: 'Леон предложит поездку и примет решение Вильгельмины; день получит завершение.',
    acts: ACT_NAMES.map((_, i) => ({
        scene: 'Леон и Вильгельмина у его машины после смены.',
        goal: 'Леон предлагает провести вечер вместе.',
        obstacle: 'Небольшой дождь и усталость после работы.',
        clue: 'На сиденье лежат плед и дорожная сумка.',
        bridge: i === 2 ? bridge : 'Леон сам предлагает продолжить вечер за ужином.',
    })),
});
const check = text => validatePlayerAgency(example(text), { userName: 'Вильгельмина' });
test('catches screenshot: noticed interest in the future is an unsupported player feeling', () => {
    const broken = 'Заметив интерес Вильгельмины к вещам в машине, смущённый Леон решает раскрыть свой секрет за ужином.';
    assert.match(check(broken).join(' '), /Акт 3, bridge/);
    assert.match(validatePlotFit(example(broken), { userName: 'Вильгельмина', genres: ['romance','slice_of_life'] }).join(' '), /игрока/);
});
test('rejects explicit player observation, decisions, questions or feelings in future acts', () => {
    for (const bad of [
        'Вильгельмина замечает вещи в машине и спрашивает об отпуске.',
        'Когда Вильгельмина согласится, Леон покупает билеты.',
        '{{user}} решает отправиться с Леоном за город.',
        'Интерес Вильгельмины становится поводом для признания.',
        'Они решают провести ночь в горах.',
    ]) {
        assert.ok(check(bad).length > 0, `Wrongly accepted: ${bad}`);
    }
});
test('allows player-optional branch with fallback and character-initiated action', () => {
    for (const good of [
        'Если Вильгельмина заметит сумку и спросит, Леон ответит; иначе сам предложит поездку за ужином.',
        'Леон показывает плед и предлагает поездку, оставляя решение Вильгельмине.',
        'Леон рассказывает про поездку за ужином; реакция Вильгельмины остаётся за игроком.',
    ]) assert.deepEqual(check(good), [], `Wrongly rejected: ${good}`);
});
test('conditional branch without no-response fallback is rejected', () => {
    assert.match(check('Если Вильгельмина спросит, Леон расскажет ей о поездке.').join(' '), /запасного варианта/);
});
test('hidden truth and projected ending cannot assume future user consent', () => {
    const p = example('Леон самостоятельно рассказывает о поездке за ужином.');
    p.resolution = 'Вильгельмина соглашается ехать с Леоном на выходные.';
    assert.match(validatePlayerAgency(p,{ userName:'Вильгельмина' }).join(' '),/resolution/);
    p.resolution = 'Леон предлагает поездку; итог зависит от ответа игрока.';
    p.hiddenTruth = 'Леон знает об интересе Вильгельмины к сумке.';
    assert.match(validatePlayerAgency(p,{ userName:'Вильгельмина' }).join(' '),/hiddenTruth/);
});
test('old acts are not rewritten or retroactively rejected during replanning', () => {
    const p = example('Леон предлагает совместную поездку.');
    p.acts[0].bridge = 'Вильгельмина решает поехать с Леоном.';
    assert.ok(validatePlayerAgency(p,{userName:'Вильгельмина'}).length);
    assert.deepEqual(validatePlayerAgency(p,{userName:'Вильгельмина',fromAct:2}), []);
});
test('generation, review, injection and replan all prioritize player control', () => {
    const prompt = generatePlannerPrompt({genres:['romance','slice_of_life']});
    assert.match(prompt, /Заметив интерес \{\{user\}\}/);
    assert.match(prompt, /вариант «иначе»/);
    const story = {plot: example('Леон показывает плед.'),stageIndex:2,genres:['romance','slice_of_life'], memory:{}};
    assert.match(buildInjection(story), /плане написано, что игрок заметит/);
    assert.match(buildReviewPrompt(story,[]), /не записывай в decisions/i);
    assert.match(buildReplanPrompt(story,'Игрок отказался'), /Условный путь обязан иметь альтернативу/);
});
test('manifest, interface and documentation versions must match for every release', () => {
    const base = resolve(dirname(fileURLToPath(import.meta.url)),'..');
    const manifest = JSON.parse(readFileSync(resolve(base,'manifest.json'),'utf8'));
    const html = readFileSync(resolve(base,'settings.html'),'utf8');
    const readme = readFileSync(resolve(base,'README.md'),'utf8');
    assert.match(html,new RegExp(`Сюжетный режиссёр v${manifest.version.replaceAll('.','\\.')}`));
    assert.ok(readme.startsWith(`# Story Arc Director v${manifest.version}`));
    assert.equal(manifest.version,'0.3.10');
});
