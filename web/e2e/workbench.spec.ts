import { expect, test } from '@playwright/test'

test('loads the workbench and solves the sample level', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByText(/SokoForge|推箱工坊/).first()).toBeVisible()
  await expect.poll(() => page.locator('.board .cell').count()).toBeGreaterThanOrEqual(25)
  await page.locator('.primary-action').first().click()
  await expect(page.locator('.solution-result')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: testInfo.outputPath('workbench.png'), fullPage: true })
})

test('switches language and edits a cell', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.locator('.language-button').click()
  await expect(page.getByText(/推箱工坊|SokoForge/).first()).toBeVisible()
  await page.locator('.workspace-switch button').nth(1).click()
  await page.locator('.editor-tools button').first().click()
  await page.locator('.board .cell').nth(10).click()
  await expect(page.locator('.board .cell').nth(10)).toHaveClass(/wall/)
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true })
})

test('loads published levels from the static index', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Library|关卡库/ }).click()
  await expect(page.getByRole('heading', { name: /First Push|第一次推动/ })).toBeVisible()
  const published = page.getByRole('heading', { name: /Published levels|发布关卡/ }).locator('../..')
  await expect(published.locator('.result-row')).toHaveCount(216)
})

test('imports and downloads a generated level pack', async ({ page }) => {
  const pack = {
    schemaVersion: 1,
    kind: 'sokoforge-level-pack',
    levels: [{
      id: 'imported-test',
      name: 'Imported Test',
      xsb: '#####\n#@$.#\n#####',
      difficulty: { score: 12, pushes: 1, moves: 1, dependency: 0, trap: 0, away_pushes: 0, box_switches: 1 },
    }],
  }
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  })
  await expect(page.getByRole('button', { name: /Imported Test/ })).toBeVisible()
  await page.getByRole('button', { name: /^(Forge|生成)$/ }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download pack|下载关卡包/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^sokoforge-pack-.*\.json$/)
})

test('offers simple, medium, and hard generation tiers', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^(Forge|生成)$/ }).click()
  await expect(page.getByLabel(/Boxes|箱子/)).toHaveValue('4')
  await expect(page.getByLabel(/Width|宽/)).toHaveValue('10')
  await expect(page.getByLabel(/Height|高/)).toHaveValue('10')
  const tier = page.getByRole('combobox', { name: /Difficulty mode|难度模式/ })
  await expect(tier.locator('option')).toHaveCount(3)
  await tier.selectOption('simple')
  await expect(tier).toHaveValue('simple')
  await tier.selectOption('medium')
  await expect(tier).toHaveValue('medium')
  await tier.selectOption('hard')
  await expect(tier).toHaveValue('hard')
  await page.screenshot({ path: testInfo.outputPath('generation-tiers.png'), fullPage: true })
})

test('generates hard candidates with the default forge geometry', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^(Forge|生成)$/ }).click()
  await page.locator('.primary-action').click()
  await expect.poll(() => page.locator('.result-row').count(), { timeout: 30_000 }).toBeGreaterThan(0)
})

test('undoes a manual move and restarts the level', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  const moves = page.locator('.play-stats b').first()
  await expect(moves).toHaveText('0')
  const moveUp = page.getByRole('button', { name: /Move up|向上移动/ })
  await expect(moveUp).toHaveAttribute('title', /Move up|向上移动/)
  await expect(page.locator('.game-controls button')).toHaveCount(6)
  await moveUp.click()
  await expect(moves).toHaveText('1')
  await page.getByRole('button', { name: /Undo move|回退一步/ }).click()
  await expect(moves).toHaveText('0')
  await moveUp.click()
  await page.locator('.game-controls').getByRole('button', { name: /Restart|重新开始/ }).click()
  await expect(moves).toHaveText('0')
  await page.getByRole('button', { name: /Move right|向右移动/ }).click()
  await expect(moves).toHaveText('1')
  await expect(page.locator('.cell.player')).toHaveAttribute('aria-label', 'cell 18')
  await page.locator('.primary-action').first().click()
  await expect(moves).toHaveText('0')
  await expect(page.locator('.cell.player')).toHaveAttribute('aria-label', 'cell 17')
  await expect(page.locator('.solution-result')).toBeVisible({ timeout: 10_000 })
})

test('steps, pauses, and speeds up solution replay', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  await expect(page.getByText(/Move player|移动玩家/)).toBeVisible()
  await page.getByText(/How to play|玩法说明/).click()
  await expect(page.getByText(/Move with the arrow keys|使用方向键/)).toBeVisible()
  await page.locator('.primary-action').first().click()
  await expect(page.locator('.solution-result')).toBeVisible({ timeout: 10_000 })
  const position = page.locator('.playback-heading b')
  await expect(position).toHaveText(/0 \/ [1-9]/)
  await page.getByRole('button', { name: /Next step|下一步解法/ }).click()
  await expect(position).toHaveText(/1 \/ [1-9]/)
  await page.locator('.game-controls').getByRole('button', { name: /Undo move|回退一步/ }).click()
  await expect(position).toHaveText(/0 \/ [1-9]/)
  await page.getByRole('button', { name: /Next step|下一步解法/ }).click()
  await page.getByRole('button', { name: /Previous step|上一步解法/ }).click()
  await expect(position).toHaveText(/0 \/ [1-9]/)
  await page.getByRole('button', { name: /Play solution|播放解法/ }).click()
  await page.getByRole('button', { name: /Pause solution|暂停解法/ }).click()
  await expect(position).toHaveText(/0 \/ [1-9]/)
  await page.getByRole('combobox', { name: /Speed|倍速/ }).selectOption('4')
  await page.getByRole('button', { name: /Play solution|播放解法/ }).click()
  await expect(page.locator('.board-status')).toHaveClass(/solved/)
})

test('ignores malformed local library data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sokoforge-library', '[1, null, {"id":"broken"}]'))
  await page.goto('/')
  await expect(page.getByText(/SokoForge|推箱工坊/).first()).toBeVisible()
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  await page.getByRole('button', { name: /Library|关卡库/ }).click()
  const localLevels = page.getByRole('heading', { name: /My levels|我的关卡/ }).locator('../..')
  await expect(localLevels.locator('.result-row')).toHaveCount(0)
})

test('does not apply a stale solution after changing levels', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  await page.getByRole('button', { name: /Library|关卡库/ }).click()
  const published = page.getByRole('heading', { name: /Published levels|发布关卡/ }).locator('../..')
  await published.locator('.result-row').nth(215).click()
  await page.locator('.primary-action').first().click()
  await page.locator('.level-actions button').nth(2).click()
  await expect(page.getByRole('heading', { name: /First Push|第一次推动/ })).toBeVisible()
  await page.waitForTimeout(5_500)
  await expect(page.locator('.solution-result')).toHaveCount(0)
})

test('collapses the level list and jumps to a numbered level', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The published sidebar is intentionally hidden on mobile; use the responsive Library tab there.')
  await page.goto('/')
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  const jump = page.getByRole('spinbutton', { name: /Level number|关卡编号/ })
  await jump.fill('216')
  await jump.press('Enter')
  await expect(page.locator('.level-identity > span')).toHaveText(/216 \/ 216/)
  await page.getByRole('button', { name: /Collapse level list|收起关卡列表/ }).click()
  await expect(page.locator('.context-sidebar.play')).toHaveClass(/collapsed/)
  await expect(page.locator('.level-list')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('collapsed-level-list.png'), fullPage: true })
  await page.getByRole('button', { name: /Expand level list|展开关卡列表/ }).click()
  await expect(page.locator('.level-list button')).toHaveCount(216)
})
