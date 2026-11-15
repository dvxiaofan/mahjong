import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const completedSession = readFileSync(
  new URL('./fixtures/completed-local-session.json', import.meta.url),
  'utf8',
);
const completedActionCount = (JSON.parse(completedSession) as { records: readonly unknown[] })
  .records.length;

test('终局显示整局教练点评，关键节点可跳转到动作前后', async ({ page }) => {
  await page.addInitScript(
    ({ coachSettings, session }) => {
      window.localStorage.setItem('play-mahjong.coach.v1', coachSettings);
      window.localStorage.setItem('play-mahjong.local-session.v2', session);
    },
    {
      coachSettings: JSON.stringify({ enabled: true }),
      session: completedSession,
    },
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '继续上次的本地对局？' })).toBeVisible();
  await page.getByRole('button', { name: '继续对局' }).click();

  await expect(page.locator('.felt-table')).toBeVisible();
  await expect(page.getByRole('heading', { name: '教练点评' })).toBeVisible();
  await expect(page.getByText('整局', { exact: true })).toBeVisible();
  await expect(page.getByText(/^整局 \d+ 次出牌/)).toBeVisible();
  await expect(page.getByText('这局点评有用吗？')).toBeVisible();

  await page.getByRole('button', { name: '有帮助' }).click();
  await expect(page.getByText('本机反馈已记录')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出样本' })).toBeVisible();

  await page.getByRole('button', { name: /牌局记录/ }).click();
  const drawer = page.getByRole('dialog', { name: '牌局记录' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: '关键节点' })).toBeVisible();
  await expect(drawer.getByText('碰牌', { exact: true }).first()).toBeVisible();
  await expect(drawer.getByText('胡牌', { exact: true }).first()).toBeVisible();

  const afterButton = drawer
    .locator('.replay-marker')
    .filter({ hasText: '碰牌' })
    .getByRole('button', { name: '后' })
    .first();
  await afterButton.click();
  await expect(drawer.getByText(/^回放至第 \d+ 步$/)).toBeVisible();
  await expect(page.getByText(new RegExp(`^回放 \\d+/${completedActionCount}$`))).toBeVisible();
});
