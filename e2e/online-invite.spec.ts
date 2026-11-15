import { expect, test } from '@playwright/test';

test('邀请深链预填房间，两位真人加两位机器人可以开局', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto('/?mode=online');
    const createForm = host.locator('form.online-card').filter({ hasText: '创建牌桌' });
    const roomId = `e2e-${Date.now().toString(36)}`;
    await createForm.getByLabel('房间 ID').fill(roomId);
    await createForm.getByLabel('昵称').fill('房主');
    await createForm.getByRole('button', { name: '创建并入座' }).click();
    await expect(host.getByText('房主：房主（你）')).toBeVisible();

    const invite = await host.getByLabel('邀请链接和房间信息').inputValue();
    expect(invite).toContain(roomId);
    const inviteUrl = invite.match(/打开 (\S+) 自动预填/)?.[1];
    expect(inviteUrl).toBeTruthy();

    await guest.goto(inviteUrl!);
    const joinForm = guest.locator('form.online-card').filter({ hasText: '加入牌桌' });
    await expect(joinForm.getByLabel('房间 ID')).toHaveValue(roomId);
    await joinForm.getByLabel('昵称').fill('客人');
    await joinForm.getByRole('button', { name: '加入房间' }).click();

    await expect(host.getByText('客人', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: '补一个机器人' }).click();
    await host.getByRole('button', { name: '补一个机器人' }).click();
    await expect(host.getByRole('button', { name: '开始牌局' })).toBeEnabled();
    await host.getByRole('button', { name: '开始牌局' }).click();

    await expect(host.locator('.felt-table')).toBeVisible();
    await expect(guest.locator('.felt-table')).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
