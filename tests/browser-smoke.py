"""In-memory browser smoke; requires playwright and Chromium installed."""
from pathlib import Path
from base64 import b64encode
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / 'tests/browser-smoke.html').read_text()
settings = (root / 'settings.html').read_text()
core = (root / 'story-core.mjs').read_bytes()
core_url = f'data:text/javascript;base64,{b64encode(core).decode()}'
persona = (root / 'persona-context.mjs').read_bytes()
persona_url = f'data:text/javascript;base64,{b64encode(persona).decode()}'
plot_helper = (root / 'plot-request.mjs').read_text().replace("'./story-core.mjs'", repr(core_url))
plot_helper_url = f'data:text/javascript;base64,{b64encode(plot_helper.encode()).decode()}'
index = (root / 'index.js').read_text().replace("'./story-core.mjs'", repr(core_url)).replace("'./plot-request.mjs'", repr(plot_helper_url)).replace("'./persona-context.mjs'", repr(persona_url))
html = html.replace('<script type="module" src="../index.js"></script>', '')
html = html.replace("(await (await fetch('../settings.html')).text())", repr(settings))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.set_content(html)
    page.add_script_tag(content=index, type='module')
    page.wait_for_function("() => typeof storyArcDirectorBeforeGenerate === 'function'")
    page.evaluate("() => mock.emit('APP_INITIALIZED')")
    page.wait_for_selector('#sad-root')
    assert page.is_checked('#sad-genre-auto')
    assert page.locator('.sad-genre-option').count() >= 30
    assert page.locator('#sad-genre-list').locator('text=Спорт').count() > 0
    assert page.locator('#sad-genre-list').locator('text=Эротика (18+)').count() > 0
    assert page.locator('text=Выбор атмосферы').count() == 0
    assert page.locator('.sad-genre-group').count() == 10
    assert page.locator('.sad-genre-option').count() == 113
    # Search without erasing saved choices or expanding every group permanently.
    page.fill('#sad-genre-search', 'Меч и магия')
    assert page.locator('.sad-genre-group:not([hidden])').count() == 1
    assert page.locator('.sad-genre-chip:not([hidden])').count() == 1
    assert 'Фэнтези' in page.locator('.sad-genre-group:not([hidden]) summary').inner_text()
    page.fill('#sad-genre-search', '')
    assert page.locator('.sad-genre-group:not([hidden])').count() == 10
    assert page.locator('.sad-genre-group[open]').count() == 1
    # Manual multi-select reaches exactly eight; ninth checkbox becomes disabled.
    page.uncheck('#sad-genre-auto')
    chosen = ['romance','dark_romance','erotica','erotic_romance','romcom','slow_burn','forbidden_love','love_triangle']
    for genre in chosen:
        page.locator(f'label.sad-genre-chip:has(input[value="{genre}"])').click()
    assert page.locator('input.sad-genre-option:checked').count() == 8
    assert '8/8' in page.inner_text('#sad-genre-count')
    assert page.locator('input.sad-genre-option[value="relationship_drama"]').is_disabled()
    assert page.evaluate('mock.ctx.extensionSettings.story_arc_director.genres') == chosen
    page.check('#sad-genre-auto')
    assert page.locator('input.sad-genre-option:checked').count() == 0


    # Auto genre recommendation stays editable and uses no mandatory sport plot.
    page.click('#sad-suggest-genres')
    page.wait_for_function("() => !document.querySelector('#sad-suggest-genres').disabled")
    assert page.locator('input.sad-genre-option:checked').count() == 3
    assert not page.is_checked('#sad-genre-auto')
    page.locator('.sad-genre-group:has(input[value="sport"]) summary').click()
    page.locator('label.sad-genre-chip:has(input[value="sport"])').click()
    assert page.locator('input.sad-genre-option:checked').count() == 2
    page.evaluate('() => {mock.invalidPlanOnce=true; mock.agencyPlanOnce=true}')
    assert page.evaluate('mock.ctx.chat.length') == 0  # Empty chat is valid.
    page.click('#sad-generate')
    page.wait_for_function("() => Boolean(mock.ctx.chatMetadata.story_arc_director)")
    page.wait_for_function("() => !document.querySelector('#sad-generate').disabled")
    assert 'Маяк памяти' in page.inner_text('#sad-title')
    assert 'после исправления формата' in page.inner_text('#sad-status')
    assert sum('Придумай ОРИГИНАЛЬНЫЙ' in p for p in page.evaluate('mock.rawCalls')) == 3
    assert 'ПРЕДЫДУЩИЙ ВАРИАНТ НЕ ПОДХОДИТ' in page.evaluate('mock.rawCalls.at(-1)')
    assert 'игрока' in page.evaluate('mock.rawCalls.at(-1)').lower()
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.genres') == ['romance','slice_of_life']
    planner = page.evaluate('mock.rawCalls.find(p => p.includes("Придумай ОРИГИНАЛЬНЫЙ"))')
    assert 'парень игрока' in planner and 'спортсмен' in planner
    assert 'романтика + повседневность' in planner.lower()
    
    assert 'Текущий акт 1/5' in page.evaluate('mock.prompt')
    assert 'Игрок занимается живописью' in planner
    assert 'описание прочитано' in page.inner_text('#sad-active-persona')
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.personaBinding').startswith('v1:')
    assert 'Игрок занимается живописью' in page.evaluate('mock.prompt')
    # After three consecutive proposal/question hooks, interceptor adds a gentle, temporary loop reminder.
    page.evaluate("""() => { mock.ctx.chat.push(
        {is_user:false,mes:'Можем погулять?'},
        {is_user:true,mes:'Смотрю в окно.'},
        {is_user:false,mes:'Хочешь кофе?'},
        {is_user:true,mes:'Поправляю воротник.'},
        {is_user:false,mes:'Давай съездим в парк?'}
    ); storyArcDirectorBeforeGenerate([], 0, null, 'normal'); }""")
    assert 'АНТИПОВТОР' in page.evaluate('mock.prompt')
    page.evaluate("() => {mock.ctx.chat.length=0;storyArcDirectorBeforeGenerate([],0,null,'normal')}")
    assert 'АНТИПОВТОР' not in page.evaluate('mock.prompt')

    assert 'чужая персона' not in planner


    page.evaluate("() => mock.addResponse('Найдена записка с ключом.')")
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.stageIndex === 1")
    assert 'Текущий акт 2/5' in page.evaluate('mock.prompt')
    assert 'Игрок нашёл ключ' in page.text_content('#sad-memory')
    assert 'Пара встречается 3 года' in page.text_content('#sad-rel-status')

    page.evaluate("() => {mock.reviewMode='incomplete'; mock.addResponse('Путь ещё не найден.')}")
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.lastReviewCount === 2")
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.stageIndex') == 1
    assert 'Ключ найден' in page.inner_text('#sad-progress-done')
    assert 'Остаётся открыть дверь' in page.inner_text('#sad-progress-pending')
    assert 'Хранитель предложит проверить замок' in page.inner_text('#sad-progress-next')
    # Switching persona must freeze prompts and analysis, and keep the old plan intact.
    page.evaluate('() => {mock.ctx.name1="Другой игрок"; mock.ctx.powerUserSettings.persona_description="Другая биография: альпинист"; mock.emit("PERSONA_CHANGED")}')
    assert page.evaluate('mock.prompt') == ''
    assert page.locator('#sad-persona-warning').is_visible()
    stored = page.evaluate('mock.ctx.chatMetadata.story_arc_director.lastReviewCount')
    page.evaluate("() => mock.addResponse('Следующая сцена без прежней персоны')")
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.lastReviewCount') == stored
    page.evaluate('() => {mock.ctx.name1="Игрок"; mock.ctx.powerUserSettings.persona_description="Игрок занимается живописью, не любит высоту, дружелюбен."; mock.emit("PERSONA_CHANGED")}')
    assert 'Текущий акт 2/5' in page.evaluate('mock.prompt')
    assert page.locator('#sad-persona-warning').is_hidden()

    page.evaluate("() => {mock.reviewMode='branch'; mock.addResponse('Я сжигаю архив.')}")
    page.wait_for_function("() => (mock.ctx.chatMetadata.story_arc_director.revisions||[]).length === 1")
    assert 'Альтернативная сцена' in page.inner_text('#sad-scene')
    assert 'Текущий акт 3/5' in page.evaluate('mock.prompt')

    page.click('#sad-pause')
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.paused === true")
    assert page.evaluate('mock.prompt') == ''
    page.click('#sad-pause')
    page.click('#sad-finish')
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.stageIndex === 4")
    page.evaluate("() => {mock.reviewMode='final'; mock.addResponse('Я открыл правду и вернул память.')}")
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.completed === true")
    assert page.evaluate('mock.prompt') == ''
    assert not errs, f'Browser errors: {errs}'
    print('PASS: browser active persona binding, empty chat, stage progress, switch protection, genre selection, JSON repair, branching, finale')
    browser.close()
