import test from 'node:test';
import assert from 'node:assert/strict';
import { ACT_NAMES, buildInjection, buildReviewPrompt, generatePlannerPrompt, buildReplanPrompt } from '../story-core.mjs';

const plot = {
  title:'Тихий вечер', premise:'Герои дома', centralConflict:'Обсудить совместные планы',
  hiddenTruth:'СПОЙЛЕР_ТАЙНА_БУДУЩЕГО', resolution:'СПОЙЛЕР_ФИНАЛ_БУДУЩЕГО',
  acts: ACT_NAMES.map((_,i)=>({
    scene:`СЕЙЧАС_ЛОКАЦИЯ_${i+1}`,goal:`ЦЕЛЬ_АКТА_${i+1}`,
    obstacle:`ПРЕПЯТСТВИЕ_КОНЦА_${i+1}`,clue:`СПОЙЛЕР_УЛИКА_${i+1}`,bridge:`СПОЙЛЕР_ПЕРЕХОД_${i+1}`,
  })),
};
const story = (stageIndex=0) => ({
    plot, stageIndex, genres:['romance','slice_of_life'], paused:false, completed:false,
    memory:{summary:'Уже состоялся разговор', decisions:['Игрок выбрал остаться'], consequences:['Они дома']},
    actProgress:{stageIndex, confirmed:['Обсудили погоду'],pending:['Не выбрали вечерние планы']},
});

test('play prompt withholds spoilers, full arc roadmap, upcoming scenes and current bridge',()=>{
    for (let i = 0; i < 5; i++) {
        const prompt = buildInjection(story(i),'Карточка: два самостоятельных человека');
        assert.match(prompt,new RegExp(`СЕЙЧАС_ЛОКАЦИЯ_${i+1}`));
        assert.match(prompt,new RegExp(`ЦЕЛЬ_АКТА_${i+1}`));
        assert.match(prompt,/Игрок выбрал остаться/);
        assert.match(prompt,/Обсудили погоду/);
        assert.doesNotMatch(prompt,/СПОЙЛЕР_|ПРЕПЯТСТВИЕ_КОНЦА|Карта драматургии/);
        for (let j = 0; j < 5; j++) if (j !== i) assert.ok(!prompt.includes(`СЕЙЧАС_ЛОКАЦИЯ_${j+1}`));
    }
});

test('explicitly insists on one dramatic beat per turn and protects player agency',()=>{
    const p = buildInjection(story(0));
    assert.match(p,/At MOST one small playable step per response/);
    assert.match(p,/DO NOT require a question/);
    assert.match(p,/Do not mechanically end each reply with a question/);
    assert.match(p,/Detailed and expressive prose is allowed/);
    assert.match(p,/NEVER author \{\{user\}\}/);
    assert.match(p,/Do NOT change the act on your own/);
    assert.match(buildInjection(story(4)),/Do not rush an ending in one answer/);
});

test('planner and reviewer retain complete long-term plan while live prompt does not',()=>{
    const p=buildReviewPrompt(story(0),[{is_user:true,mes:'Пока ничего не решил'}]);
    assert.match(p,/Never mark an act complete merely because/);
    const planner=generatePlannerPrompt({genres:['romance','slice_of_life']});
    assert.match(planner,/Exactly five acts/);
    assert.match(buildReplanPrompt(story(0),'Игрок изменил решение'),/Replan only the remaining/);
});
