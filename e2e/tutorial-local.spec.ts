import { expect, test } from '@playwright/test';

test('教程用真实动作推进，本地对局可开局并打开牌局记录', async ({ page }) => {
  await page.goto('/?mode=tutorial');
  await expect(page.getByRole('heading', { name: '规则短教程' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '发财补牌' })).toBeVisible();

  await page.getByRole('button', { name: '摸牌' }).click();
  await expect(page.getByText('做对了')).toBeVisible();
  await page.getByRole('button', { name: '继续下一步' }).click();
  await page.getByRole('button', { name: '胡牌' }).click();
  await expect(page.getByRole('button', { name: '完成本课' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: '开始对局' }).click();
  await expect(page.locator('.felt-table')).toBeVisible();
  await page.getByRole('button', { name: /牌局记录/ }).click();
  await expect(page.getByRole('dialog', { name: '牌局记录' })).toBeVisible();
});
