import { test, expect, isolatedContext, type Page } from './harness';
const memory = '/albums/fixture-album/memories/fixture-memory',
  settings = '/albums/fixture-album/settings';
async function identity(page: Page, value: string) {
  await page.getByLabel('Danh tính demo', { exact: true }).selectOption(value);
  await expect(page.getByLabel('Danh tính demo', { exact: true })).toHaveValue(value);
}
for (const actor of ['owner', 'contributor', 'viewer', 'outsider']) {
  test(`local UX role matrix/deep links: ${actor}`, async ({ page }) => {
    await page.goto('/');
    await identity(page, actor);
    await page.goto(memory);
    if (actor === 'outsider') {
      await expect(
        page.getByRole('heading', { name: 'Không thể mở kỷ niệm', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.memory-story')).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('heading', { name: 'Một sáng trong vườn', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sửa kỷ niệm', exact: true })).toHaveCount(
        actor === 'owner' ? 1 : 0,
      );
      await expect(page.getByLabel('Bình luận mới', { exact: true })).toHaveCount(
        actor === 'viewer' ? 0 : 1,
      );
      await expect(
        page.getByRole('group', { name: 'Cảm xúc', exact: true }).getByRole('button'),
      ).toHaveCount(actor === 'viewer' ? 0 : 3);
    }
    await page.goto(settings);
    if (actor === 'owner') {
      await expect(
        page.getByRole('button', { name: 'Tạo lời mời demo', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Xóa thành viên Chủ album demo', exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('heading', { name: 'Không có quyền quản lý album', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tạo lời mời demo', exact: true })).toHaveCount(
        0,
      );
    }
  });
}
test('comment author editing/plain text and owner moderation; reaction toggle/replace persists', async ({
  page,
}) => {
  await page.goto(memory);
  await identity(page, 'contributor');
  await page
    .getByLabel('Bình luận mới', { exact: true })
    .fill('<img src=x onerror=alert(1)> Tiếng Việt 🌷\nLine two');
  await page.getByRole('button', { name: 'Đăng bình luận', exact: true }).click();
  await expect(page.locator('.comment-text')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.comment img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sửa bình luận', exact: true }).click();
  await page.getByLabel('Sửa bình luận', { exact: true }).fill('Edited Unicode 🌷');
  await page.getByRole('button', { name: 'Lưu bình luận', exact: true }).click();
  await expect(page.getByText('Đã chỉnh sửa', { exact: true })).toBeVisible();
  const reactions = page.getByRole('group', { name: 'Cảm xúc', exact: true });
  await reactions.getByRole('button', { name: '❤️ 0', exact: true }).click();
  await expect(reactions.getByRole('button', { name: '❤️ 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reactions.getByRole('button', { name: '❤️ 1', exact: true }).click();
  await expect(reactions.getByRole('button', { name: '❤️ 0', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await reactions.getByRole('button', { name: '😊 0', exact: true }).click();
  await reactions.getByRole('button', { name: '❤️ 0', exact: true }).click();
  await expect(reactions.getByRole('button', { name: '😊 0', exact: true })).toBeVisible();
  await expect(reactions.getByRole('button', { name: '❤️ 1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.comment-text')).toHaveText('Edited Unicode 🌷');
  await expect(reactions.getByRole('button', { name: '❤️ 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await identity(page, 'owner');
  await expect(page.getByRole('button', { name: 'Sửa bình luận', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa bình luận', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('.comment-text')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bình luận', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.locator('.comment')).toHaveCount(0);
});
test('same-store invitation joins once, already-member, revoke and expiry; invalid cross-context token is explained', async ({
  page,
  browser,
  browserName,
}) => {
  await page.goto(settings);
  await page.getByRole('button', { name: 'Tạo lời mời demo', exact: true }).click();
  const link = await page.getByLabel('Liên kết demo', { exact: true }).inputValue();
  await page.goto(link);
  await expect(page.getByText('Bạn đã là thành viên album này.', { exact: true })).toBeVisible();
  await identity(page, 'outsider');
  await page.getByRole('button', { name: 'Tham gia trên thiết bị này', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Những ngày bên nhau', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true })).toHaveCount(0);
  await page.goto(link);
  await expect(page.getByText('Bạn đã là thành viên album này.', { exact: true })).toBeVisible();
  await identity(page, 'owner');
  await page.goto(settings);
  await expect(page.locator('.members > li')).toHaveCount(4);
  await page.getByRole('button', { name: 'Thu hồi lời mời', exact: true }).click();
  await expect(page.locator('.invites')).toContainText('Đã thu hồi');
  await page.goto(link);
  await expect(page.getByRole('alert')).toHaveText('Lời mời đã được thu hồi.');
  await page.goto(settings);
  await page.getByRole('button', { name: 'Tạo lời mời demo', exact: true }).click();
  await expect(page.locator('.invites > li')).toHaveCount(2);
  const expiryLink = await page.getByLabel('Liên kết demo', { exact: true }).last().inputValue();
  await page.clock.setFixedTime(new Date(Date.now() + 8 * 86400000));
  await page.goto(expiryLink);
  await expect(page.getByRole('alert')).toHaveText('Lời mời đã hết hạn.');
  const other = await isolatedContext(browser, browserName, new URL(page.url()).origin),
    external = await other.newPage();
  try {
    await external.goto(link);
    await expect(external.getByRole('alert')).toHaveText('Mã mời không tồn tại trên thiết bị này.');
  } finally {
    await other.close();
  }
});
test('role downgrade/removal/leave updates access immediately and owner controls stay protected', async ({
  page,
}) => {
  await page.goto(settings);
  await page.getByLabel('Quyền Người góp chuyện demo', { exact: true }).selectOption('viewer');
  await identity(page, 'contributor');
  await page.goto(memory);
  await expect(page.getByLabel('Bình luận mới', { exact: true })).toHaveCount(0);
  await identity(page, 'owner');
  await page.goto(settings);
  await page
    .getByRole('button', { name: 'Xóa thành viên Người góp chuyện demo', exact: true })
    .click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page.locator('.members > li')).toHaveCount(2);
  await identity(page, 'contributor');
  await page.goto(memory);
  await expect(
    page.getByRole('heading', { name: 'Không thể mở kỷ niệm', exact: true }),
  ).toBeVisible();
  await identity(page, 'viewer');
  await page.goto('/albums/fixture-album');
  await page.getByRole('button', { name: 'Rời album', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận rời album', exact: true }).click();
  await expect(page).toHaveURL(/\/albums$/);
  await expect(page.getByRole('heading', { name: 'Chưa có album', exact: true })).toBeVisible();
});
