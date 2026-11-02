import { useEffect, useRef, useState } from 'react';
import { canEdit, canEditOwn, canWrite, roleOf } from '../../domain/policy';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Avatar, Button, ConfirmDialog, Textarea, Toast } from '../../components/ui';

export function CommentsPanel({ memoryId, albumId }: { memoryId: string; albumId: string }) {
  const { state, actor, dispatch } = useJourney(),
    action = useAction(),
    [newText, setNewText] = useState(''),
    [editing, setEditing] = useState<string>(),
    [editText, setEditText] = useState(''),
    [remove, setRemove] = useState<string>(),
    [openMenu, setOpenMenu] = useState<string>(),
    [notice, setNotice] = useState('');
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const role = roleOf(state!.members, albumId, actor),
    comments = state!.comments.filter((comment) => comment.memoryId === memoryId),
    original = comments.find((comment) => comment.id === editing)?.text ?? '';
  useUnsavedChanges(!!newText || (!!editing && editText !== original));
  useEffect(() => {
    if (!openMenu) return;
    document
      .querySelector<HTMLButtonElement>(`[data-comment-menu="${openMenu}"] .comment-menu button`)
      ?.focus();
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (
        event instanceof PointerEvent &&
        (event.target as Element)
          .closest('[data-comment-menu]')
          ?.getAttribute('data-comment-menu') === openMenu
      )
        return;
      setOpenMenu(undefined);
      menuTrigger.current?.focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [openMenu]);
  return (
    <section className="social memory-social-panel" aria-labelledby="comments-title">
      <div className="comments-heading">
        <h2 id="comments-title">Bình luận</h2>
        <span>{comments.length}</span>
      </div>
      {comments.length === 0 && <p className="comments-empty">Chưa có bình luận.</p>}
      <div className="comments">
        {comments.map((comment) => {
          const name =
            state!.users.find((user) => user.id === comment.userId)?.name ?? 'Danh tính cũ';
          const mayEdit = canEditOwn(role, comment.userId, actor);
          const mayDelete = canEdit(role, comment.userId, actor);
          return (
            <article className="comment" key={comment.id}>
              <div className="comment-topline">
                <Avatar name={name} />
                <div className="comment-author">
                  <strong>{name}</strong>
                  <span>
                    {comment.createdAt ? (
                      <time dateTime={comment.createdAt}>
                        {new Date(comment.createdAt).toLocaleString('vi-VN')}
                      </time>
                    ) : (
                      'Chưa rõ thời gian'
                    )}
                    {comment.edited && ' · Đã chỉnh sửa'}
                  </span>
                </div>
                {(mayEdit || mayDelete) && editing !== comment.id && (
                  <div className="comment-menu-wrap" data-comment-menu={comment.id}>
                    <button
                      type="button"
                      className="comment-menu-trigger"
                      aria-label={`Tùy chọn bình luận của ${name}`}
                      aria-expanded={openMenu === comment.id}
                      disabled={action.pending || !!editing}
                      onClick={(event) => {
                        menuTrigger.current = event.currentTarget;
                        setOpenMenu(openMenu === comment.id ? undefined : comment.id);
                      }}
                    >
                      ⋯
                    </button>
                    {openMenu === comment.id && (
                      <div className="comment-menu" role="group" aria-label="Thao tác bình luận">
                        {mayEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(comment.id);
                              setEditText(comment.text);
                              setOpenMenu(undefined);
                            }}
                          >
                            Sửa bình luận
                          </button>
                        )}
                        {mayDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              action.clear();
                              setRemove(comment.id);
                              setOpenMenu(undefined);
                            }}
                          >
                            Xóa bình luận
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {editing === comment.id && mayEdit ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editText.trim()) return;
                    void action.run(async () => {
                      await dispatch({
                        type: 'editComment',
                        commentId: comment.id,
                        text: editText.trim(),
                      });
                      setEditing(undefined);
                      setNotice('Đã lưu bình luận.');
                    });
                  }}
                >
                  <Textarea
                    label="Sửa bình luận"
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    maxLength={5000}
                    required
                    disabled={action.pending}
                  />
                  <div className="actions">
                    <Button type="submit" disabled={action.pending || !editText.trim()}>
                      Lưu bình luận
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={action.pending}
                      onClick={() => {
                        if (
                          editText === comment.text ||
                          window.confirm('Bỏ thay đổi bình luận chưa lưu?')
                        )
                          setEditing(undefined);
                      }}
                    >
                      Hủy sửa
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="comment-text">{comment.text}</p>
              )}
            </article>
          );
        })}
      </div>
      {canWrite(role) && !editing && (
        <form
          className="comment-compose"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newText.trim()) return;
            void action.run(async () => {
              await dispatch({ type: 'addComment', memoryId, text: newText.trim() });
              setNewText('');
              setNotice('Đã đăng bình luận.');
            });
          }}
        >
          <Textarea
            label="Bình luận mới"
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
            required
            maxLength={5000}
            disabled={action.pending}
          />
          <Button type="submit" disabled={action.pending || !newText.trim()}>
            {action.pending ? 'Đang gửi…' : 'Gửi bình luận'}
          </Button>
        </form>
      )}
      {action.error && !remove && <Alert>{action.error}</Alert>}
      <Toast>{notice}</Toast>
      <ConfirmDialog
        open={!!remove}
        title="Xóa bình luận?"
        description="Bình luận này sẽ bị xóa khỏi kỷ niệm."
        pending={action.pending}
        error={action.error}
        onCancel={() => setRemove(undefined)}
        onConfirm={() =>
          void action.run(async () => {
            if (remove) await dispatch({ type: 'deleteComment', commentId: remove });
            setRemove(undefined);
            setNotice('Đã xóa bình luận.');
          })
        }
      />
    </section>
  );
}
