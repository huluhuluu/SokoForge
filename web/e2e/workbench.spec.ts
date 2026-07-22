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

test('undoes a manual move and restarts the level', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => page.locator('.level-list button').count()).toBe(216)
  const moves = page.locator('.play-stats b').first()
  await expect(moves).toHaveText('0')
  await page.locator('.dpad button').first().click()
  await expect(moves).toHaveText('1')
  await page.getByRole('button', { name: /Undo move|回退一步/ }).click()
  await expect(moves).toHaveText('0')
  await page.locator('.dpad button').first().click()
  await page.locator('.play-actions').getByRole('button', { name: /Restart|重新开始/ }).click()
  await expect(moves).toHaveText('0')
  await page.locator('.dpad button').nth(3).click()
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
  await page.locator('.play-actions').getByRole('button', { name: /Undo move|回退一步/ }).click()
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
