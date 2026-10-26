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
    assert.match(p,/ОДИН ОТВЕТ = НЕ БОЛЬШЕ ОДНОГО НЕБОЛЬШОГО ИГРОВОГО ШАГА/);
    assert.match(p,/НЕ ОБЯЗАТЕЛЬНО задавай вопрос/);
    assert.match(p,/Не заканчивай каждый ответ вопросом/);
    assert.match(p,/Длина и выразительность описаний свободны/);
    assert.match(p,/Не управляй действиями/);
    assert.match(p,/НЕ переходи к следующему акту самостоятельно/);
    assert.match(buildInjection(story(4)),/Не торопи итог в один ответ/);
});

test('planner and reviewer retain complete long-term plan while live prompt does not',()=>{
    const p=buildReviewPrompt(story(0),[{is_user:true,mes:'Пока ничего не решил'}]);
    assert.match(p,/Не объявляй акт завершённым только потому/);
    const planner=generatePlannerPrompt({genres:['romance','slice_of_life']});
    assert.match(planner,/Пять актов/);
    assert.match(buildReplanPrompt(story(0),'Игрок изменил решение'),/Перестрой оставшуюся часть/);
});
