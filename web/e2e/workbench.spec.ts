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
