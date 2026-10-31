import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ConfirmDialog, Dialog, Input } from './index';
afterEach(cleanup);
function ConfirmExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Xóa mẫu</Button>
      <ConfirmDialog
        open={open}
        title="Xóa mẫu?"
        description="Chỉ fixture"
        pending={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}
test('confirmation initially focuses cancel and returns to the initiating button', async () => {
  const user = userEvent.setup();
  render(<ConfirmExample />);
  await user.click(screen.getByRole('button', { name: 'Xóa mẫu' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hủy' }));
  await user.click(screen.getByRole('button', { name: 'Hủy' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Xóa mẫu' }));
});
function Example({ dirty = false, pending = false }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      title="Form mẫu"
      description="Kiểm tra bàn phím"
      open={open}
      onOpenChange={setOpen}
      dirty={dirty}
      pending={pending}
      trigger={<Button>Mở</Button>}
    >
      <Input label="Tên" error="Cần tên" />
      <Button>Lưu</Button>
    </Dialog>
  );
}
test('dialog has labels, traps focus and Escape returns focus', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'Mở' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Form mẫu' })).toBeTruthy();
  expect(screen.getByLabelText('Tên').getAttribute('aria-describedby')).toBeTruthy();
  for (let i = 0; i < 8; i++) {
    await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  }
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
test('dirty form rejects discard and pending form cannot close', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Example dirty />);
  await user.click(screen.getByRole('button', { name: 'Mở' }));
  await user.keyboard('{Escape}');
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
  cleanup();
  render(<Example pending />);
  await user.click(screen.getByRole('button', { name: 'Mở' }));
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeTruthy();
});
