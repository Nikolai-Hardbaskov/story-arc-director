"""In-memory browser smoke; requires playwright and Chromium installed."""
from pathlib import Path
from base64 import b64encode
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / 'tests/browser-smoke.html').read_text()
settings = (root / 'settings.html').read_text()
core = (root / 'story-core.mjs').read_bytes()
index = (root / 'index.js').read_text().replace("'./story-core.mjs'", f"'data:text/javascript;base64,{b64encode(core).decode()}'")
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

    # Auto genre recommendation stays editable and uses no mandatory sport plot.
    page.click('#sad-suggest-genres')
    page.wait_for_function("() => !document.querySelector('#sad-suggest-genres').disabled")
    assert page.locator('input.sad-genre-option:checked').count() == 3
    assert not page.is_checked('#sad-genre-auto')
    page.locator('input.sad-genre-option[value="sport"]').uncheck(force=True)
    assert page.locator('input.sad-genre-option:checked').count() == 2
    page.click('#sad-generate')
    page.wait_for_function("() => Boolean(mock.ctx.chatMetadata.story_arc_director)")
    page.wait_for_function("() => !document.querySelector('#sad-generate').disabled")
    assert 'Маяк памяти' in page.inner_text('#sad-title')
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.genres') == ['romance','slice_of_life']
    planner = page.evaluate('mock.rawCalls.find(p => p.includes("Придумай ОРИГИНАЛЬНЫЙ"))')
    assert 'парень игрока' in planner and 'спортсмен' in planner
    assert 'романтика + повседневность' in planner.lower()
    
    assert 'АКТ 1/5' in page.evaluate('mock.prompt')

    page.evaluate("() => mock.addResponse('Найдена записка с ключом.')")
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.stageIndex === 1")
    assert 'АКТ 2/5' in page.evaluate('mock.prompt')
    assert 'Игрок нашёл ключ' in page.text_content('#sad-memory')
    assert 'Пара встречается 3 года' in page.text_content('#sad-rel-status')

    page.evaluate("() => {mock.reviewMode='incomplete'; mock.addResponse('Путь ещё не найден.')}")
    page.wait_for_function("() => mock.ctx.chatMetadata.story_arc_director.lastReviewCount === 2")
    assert page.evaluate('mock.ctx.chatMetadata.story_arc_director.stageIndex') == 1

    page.evaluate("() => {mock.reviewMode='branch'; mock.addResponse('Я сжигаю архив.')}")
    page.wait_for_function("() => (mock.ctx.chatMetadata.story_arc_director.revisions||[]).length === 1")
    assert 'Альтернативная сцена' in page.inner_text('#sad-scene')
    assert 'АКТ 3/5' in page.evaluate('mock.prompt')

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
    print('PASS: browser genre suggestion + multi-select + couple memory + generation + branching + ending')
    browser.close()
