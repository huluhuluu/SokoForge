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
  await expect(page.locator('.result-list').first().locator('.result-row')).toHaveCount(8)
})
