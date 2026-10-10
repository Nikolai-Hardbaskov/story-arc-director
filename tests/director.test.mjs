import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACT_NAMES, getMode, fingerprintChat, recentTranscript, buildReviewPrompt,
    parseReview, applyReview, shouldReview, shouldReplan,
    buildReplanPrompt, parseReplan, applyReplan, buildInjection,
} from '../story-core.mjs';

const plot = {
    title: 'Город забытых имён', premise: 'В городе крадут воспоминания.',
    centralConflict: 'Остановить кражи памяти.', hiddenTruth: 'Мэр скрыл причину катастрофы.',
    resolution: 'Память возвращена и последствия осмыслены.',
    acts: ACT_NAMES.map((_, i) => ({
        scene: `Сцена ${i + 1}`, goal: `Цель ${i + 1}`, obstacle: `Барьер ${i + 1}`,
        clue: `Улика ${i + 1}`, bridge: `Переход ${i + 1}`,
    })),
};
const transcript = [
    { is_user: true, mes: 'Я выбираю помочь беженцам.' },
    { is_user: false, mes: 'Они раскрывают мне тайну мэра.' },
];
const answer = {
    sceneComplete: true, endingComplete: false, confidence: 0.9,
    reason: 'Игрок получил нужную улику и ответил на вопрос сцены',
    summary: 'Игрок помог беженцам, узнал тайну мэра.',
    decisions: ['Помог беженцам'], consequences: ['Получено доверие'],
    openThreads: ['Что скрывает архив?'], deviation: 'major',
    deviationReason: 'Игрок отказался от миссии мэра и присоединился к беженцам',
};
const story = (patch = {}) => ({
    plot, id: 'one', mode: 'smart', auto: true, stageIndex: 0, pace: 4,
    atAssistantCount: 0, lastReviewCount: 0,
    lastReviewFingerprint: '0:none', adaptive: true, completed: false, paused: false, ...patch,
});
const validReplan = stage => ({
    centralConflict: 'Спасти беженцев и вернуть память.',
    hiddenTruth: 'Мэр обменял память жителей на власть.',
    resolution: 'Герои разоблачают обман и решают судьбу архива.',
    remainingActs: plot.acts.slice(stage).map((act, n) => ({ ...act, scene: `Альтернативная сцена ${n + 1}` })),
});

test('legacy settings migrate to smart or manual, explicit mode wins', () => {
    assert.equal(getMode({ auto: true }), 'smart');
    assert.equal(getMode({ auto: false }), 'manual');
    assert.equal(getMode({ mode: 'count', auto: false }), 'count');
});

test('smart reviewer uses actual transcript, scene goal and previous facts', () => {
    const prompt = buildReviewPrompt(story({ memory: { summary: 'Здание сожжено' } }), transcript);
    assert.match(prompt, /Игрок выбираю|Я выбираю/);
    assert.match(prompt, /Здание сожжено/);
    assert.match(prompt, /Цель 1/);
    assert.match(prompt, /sceneComplete/);
    assert.doesNotMatch(prompt, /\\$\\{/);
});

test('review response is strictly validated and capped', () => {
    const parsed = parseReview('```json\n' + JSON.stringify(answer) + '\n```');
    assert.deepEqual(parsed.decisions, ['Помог беженцам']);
    assert.equal(parsed.confidence, 0.9);
    assert.throws(() => parseReview(JSON.stringify({ ...answer, sceneComplete: 'true' })), /true\/false/);
    assert.throws(() => parseReview(JSON.stringify({ ...answer, confidence: 7 })), /числом/);
    assert.throws(() => parseReview(JSON.stringify({ ...answer, decisions: null })), /массив/);
    assert.throws(() => parseReview(JSON.stringify({ ...answer, deviation: 'unknown' })), /deviation/);
});

test('semantic scene transition requires sufficient confidence', () => {
    const initial = story();
    const low = applyReview(initial, { ...answer, confidence: 0.70 }, 1, 'f1');
    assert.equal(low.stageIndex, 0);
    assert.equal(low.memory.summary, answer.summary);
    const high = applyReview(initial, answer, 1, 'f1');
    assert.equal(high.stageIndex, 1);
    assert.equal(high.atAssistantCount, 1);
    assert.equal(high.lastReviewCount, 1);
    assert.equal(high.lastReviewFingerprint, 'f1');
});

test('a scene not completed stays in the same act regardless of reply count', () => {
    const reviewed = applyReview(story(), { ...answer, sceneComplete: false }, 1000, 'f2');
    assert.equal(reviewed.stageIndex, 0);
    assert.equal(reviewed.lastReviewCount, 1000);
});

test('finale automatically closes only on reliable actual ending', () => {
    const initial = story({ stageIndex: 4 });
    const unfinished = applyReview(initial, { ...answer, sceneComplete: false, endingComplete: false }, 5, 'f');
    assert.equal(unfinished.completed, false);
    const ending = applyReview(initial, { ...answer, endingComplete: true, confidence: 0.85 }, 5, 'f');
    assert.equal(ending.completed, true);
    assert.equal(buildInjection(ending), '');
    const dubious = applyReview(initial, { ...answer, endingComplete: true, confidence: 0.80 }, 5, 'f');
    assert.equal(dubious.completed, false);
    const contradictory = applyReview(initial, { ...answer, sceneComplete: false, endingComplete: true }, 5, 'f');
    assert.equal(contradictory.completed, false);
});

test('paused and completed stories ignore LLM review', () => {
    const paused = story({ paused: true });
    const finished = story({ completed: true });
    assert.equal(applyReview(paused, answer, 1, 'x'), paused);
    assert.equal(applyReview(finished, answer, 1, 'x'), finished);
});

test('fingerprints change for swipes, edits and new messages', () => {
    const original = fingerprintChat(transcript);
    const swipe = fingerprintChat([{ ...transcript[0] }, { ...transcript[1], mes: 'Я отказываюсь помочь мэру.' }]);
    assert.notEqual(original, swipe);
    assert.notEqual(original, fingerprintChat([...transcript, { is_user: true, mes: 'Новая реплика' }]));
    assert.equal(original, fingerprintChat(transcript));
});

test('smart mode watches each answer by default, and notices swipes', () => {
    const initial = story({ lastReviewCount: 0 });
    assert.equal(shouldReview(initial, transcript), true);
    assert.equal(shouldReview(story({ mode: 'count' }), transcript), false);
    assert.equal(shouldReview(story({ paused: true }), transcript), false);
    const reviewed = story({ lastReviewCount: 1, lastReviewFingerprint: fingerprintChat(transcript) });
    assert.equal(shouldReview(reviewed, transcript), false);
    const swiped = [{ ...transcript[0] }, { ...transcript[1], mes: 'Другая реплика' }];
    assert.equal(shouldReview(reviewed, swiped), true);
    const slow = story({ reviewEvery: 2, lastReviewCount: 0 });
    assert.equal(shouldReview(slow, transcript), false);
    assert.equal(shouldReview(slow, [...transcript, { is_user: false, mes: 'продолжение' }]), true);
});

test('major deviations trigger replanning with cooldown', () => {
    assert.equal(shouldReplan(story(), answer, 10), true);
    assert.equal(shouldReplan(story({ adaptive: false }), answer, 10), false);
    assert.equal(shouldReplan(story(), { ...answer, deviation: 'minor' }, 10), false);
    assert.equal(shouldReplan(story({ lastReplanCount: 10 }), answer, 11), false);
    assert.equal(shouldReplan(story({ lastReplanCount: 10 }), answer, 12), true);
});

test('replan prompt and parsing only update future acts', () => {
    const original = story({ stageIndex: 2, memory: { decisions: ['Поддержал беженцев'] } });
    const p = buildReplanPrompt(original, 'Мэр сбежал');
    assert.match(p, /ровно 3 акт/);
    assert.match(p, /Мэр сбежал/);
    const replan = parseReplan(JSON.stringify(validReplan(2)), 2);
    const modified = applyReplan(original, replan, 8, 'Мэр сбежал');
    assert.deepEqual(modified.plot.acts.slice(0, 2), plot.acts.slice(0, 2));
    assert.equal(modified.plot.acts[2].scene, 'Альтернативная сцена 1');
    assert.equal(modified.plot.acts.length, 5);
    assert.equal(modified.revisions.length, 1);
    assert.equal(modified.plot.resolution, replan.resolution);
    assert.notEqual(modified.plot.centralConflict, plot.centralConflict);
    assert.throws(() => parseReplan(JSON.stringify({ ...validReplan(2), remainingActs: [] }), 2), /3/);
    assert.throws(() => applyReplan(original, validReplan(3), 9, 'bad'), /число актов/);
});

test('director prompt preserves branch memory and avoids pushing player actions', () => {
    const active = applyReplan(story({ stageIndex: 1, memory: {
        summary: 'Вместо мэра игрок выбрал беженцев.', decisions: ['Поддержал беженцев'],
        consequences: ['Мэр объявил награду'], openThreads: ['Где архив?'],
    } }), validReplan(1), 4, 'Выбор стороны');
    const prompt = buildInjection(active);
    assert.match(prompt, /Поддержал беженцев/);
    assert.match(prompt, /Мэр объявил награду/);
    assert.match(prompt, /подтверждённые факты и решения игрока/i);
    assert.match(prompt, /Альтернативная сцена 1/);
});

test('logs and memory fields remain bounded in metadata', () => {
    let current = story();
    for (let n = 1; n < 40; n++) {
        current = applyReview(current, { ...answer, sceneComplete: false }, n, `fp-${n}`);
    }
    assert.equal(current.reviewLog.length, 15);
    assert.equal(current.stageIndex, 0);
    assert.equal(recentTranscript(transcript).includes('беженцам'), true);
});
