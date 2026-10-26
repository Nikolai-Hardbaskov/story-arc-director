import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACT_NAMES, parsePlot, generatePlannerPrompt, buildInjection,
    countAssistantReplies, advanceByCount,
} from '../story-core.mjs';

const plan = {
    title: 'Осколок маяка',
    premise: 'На побережье гаснет маяк, который хранит память города.',
    centralConflict: 'Спасти горожан и узнать, кто крадёт воспоминания.',
    hiddenTruth: 'Хранитель обменял свет на жизнь сестры.',
    resolution: 'Правду признают, маяк зажигают другим способом, сестру спасают ценой утраты архива.',
    acts: ACT_NAMES.map((act, i) => ({
        scene: `${act}: сцена ${i + 1}`,
        goal: `Цель ${i + 1}`,
        obstacle: `Препятствие ${i + 1}`,
        clue: `Улика ${i + 1}`,
        bridge: `Переход ${i + 1}`,
    })),
};

function story(overrides = {}) {
    return { plot: plan, stageIndex: 0, auto: true, pace: 4,
        atAssistantCount: 10, paused: false, completed: false, ...overrides };
}

test('parses fenced JSON and validates all five beats', () => {
    const actual = parsePlot(`\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``);
    assert.equal(actual.title, plan.title);
    assert.equal(actual.acts.length, 5);
    assert.deepEqual(actual.acts[2], plan.acts[2]);
});

test('rejects missing acts and malformed JSON', () => {
    assert.throws(() => parsePlot(JSON.stringify({ ...plan, acts: plan.acts.slice(0, 4) })), /пять/);
    assert.throws(() => parsePlot('{"title": '), /JSON/);
    assert.throws(() => parsePlot('{}'), /пять/);
});

test('a missing act field is not silently invented', () => {
    const p = structuredClone(plan);
    delete p.acts[3].bridge;
    assert.throws(() => parsePlot(JSON.stringify(p)), /bridge/);
});

test('planner asks for a closed ending and preserves player agency', () => {
    const p = generatePlannerPrompt({ idea: 'тайна старой библиотеки', genre: 'mystery', context: 'Алиса ищет брата' });
    assert.match(p, /тайна старой библиотеки/);
    assert.match(p, /Алиса ищет брата/);
    assert.match(p, /развязк/i);
    assert.match(p, /не приписывай пользователю/i);
});

test('injection is secret, act-specific, and can be disabled', () => {
    const first = buildInjection(story());
    assert.match(first, /Текущий акт 1\/5/);
    assert.match(first, /Не управляй действиями/);
    assert.doesNotMatch(first, /Ожидаемая развязка/);
    const last = buildInjection(story({ stageIndex: 4 }));
    assert.match(last, /ФИНАЛЬНЫЙ АКТ/);
    assert.equal(buildInjection(story({ paused: true })), '');
    assert.equal(buildInjection(story({ completed: true })), '');
});

test('counts actual accepted AI replies, not user, system or swipe slots', () => {
    assert.equal(countAssistantReplies([
        { is_user: true, mes: 'Hi' },
        { is_user: false, mes: 'Hello', swipes: ['Hello', 'Bye'] },
        { is_user: false, is_system: true, mes: 'System' },
        { is_user: true, mes: 'again' },
        { is_user: false, mes: 'Again' },
    ]), 2);
});

test('auto advances by reply count, catches up, never skips resolution', () => {
    const original = story();
    assert.equal(advanceByCount(original, 13), original);
    const one = advanceByCount(original, 14);
    assert.equal(one.stageIndex, 1);
    assert.equal(one.atAssistantCount, 14);
    assert.equal(advanceByCount(original, 30).stageIndex, 4);
    assert.equal(advanceByCount(one, 500).stageIndex, 4);
});

test('paused, manual or completed story does not advance', () => {
    for (const props of [{ paused: true }, { auto: false }, { completed: true }]) {
        const original = story(props);
        assert.equal(advanceByCount(original, 900), original);
    }
});
