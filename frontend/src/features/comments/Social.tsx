import { useState } from 'react';
import type { Emoji } from '../../domain/types';
import { canEdit, canEditOwn, canWrite, roleOf } from '../../domain/policy';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Avatar, Button, ConfirmDialog, Textarea, Toast } from '../../components/ui';
const emojis: Emoji[] = ['❤️', '😊', '🎉'];
export function Social({ memoryId, albumId }: { memoryId: string; albumId: string }) {
  const { state, actor, dispatch } = useJourney(),
    action = useAction(),
    [newText, setNewText] = useState(''),
    [editing, setEditing] = useState<string>(),
    [editText, setEditText] = useState(''),
    [remove, setRemove] = useState<string>(),
    [notice, setNotice] = useState('');
  const role = roleOf(state!.members, albumId, actor),
    comments = state!.comments.filter((c) => c.memoryId === memoryId),
    reactions = state!.reactions.filter((r) => r.memoryId === memoryId),
    original = comments.find((c) => c.id === editing)?.text ?? '';
  useUnsavedChanges(!!newText || (!!editing && editText !== original));
  return (
    <section className="social memory-social-panel">
      <h2>Cảm xúc</h2>
      <div className="actions" role="group" aria-label="Cảm xúc">
        {emojis.map((emoji) => {
          const count = reactions.filter((r) => r.emoji === emoji).length,
            selected = reactions.some((r) => r.userId === actor && r.emoji === emoji);
          return canWrite(role) ? (
            <Button
              key={emoji}
              variant="secondary"
              aria-pressed={selected}
              aria-label={`${emoji} ${count}`}
              disabled={action.pending}
              onClick={() => void action.run(() => dispatch({ type: 'react', memoryId, emoji }))}
            >
              {emoji} {count}
            </Button>
          ) : (
            <span className="reaction-count" key={emoji}>
              {emoji} {count}
            </span>
          );
        })}
      </div>
      <h2>Bình luận</h2>
      {comments.length === 0 && <p>Chưa có bình luận.</p>}
      <div className="comments">
        {comments.map((comment) => {
          const name = state!.users.find((u) => u.id === comment.userId)?.name ?? 'Danh tính cũ';
          return (
            <article className="comment" key={comment.id}>
              <div className="member-name">
                <Avatar name={name} />
                <strong>{name}</strong>
                {comment.edited && <span>Đã chỉnh sửa</span>}
              </div>
              {editing === comment.id && canEditOwn(role, comment.userId, actor) ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.run(async () => {
                      await dispatch({
                        type: 'editComment',
                        commentId: comment.id,
                        text: editText,
                      });
                      setEditing(undefined);
                      setNotice('Đã lưu bình luận.');
                    });
                  }}
                >
                  <Textarea
                    label="Sửa bình luận"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={5000}
                    required
                    disabled={action.pending}
                  />
                  <div className="actions">
                    <Button type="submit" disabled={action.pending}>
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
              <div className="actions">
                {canEditOwn(role, comment.userId, actor) && editing !== comment.id && (
                  <Button
                    variant="secondary"
                    disabled={action.pending || !!editing}
                    onClick={() => {
                      setEditing(comment.id);
                      setEditText(comment.text);
                    }}
                  >
                    Sửa bình luận
                  </Button>
                )}
                {canEdit(role, comment.userId, actor) && (
                  <Button
                    variant="danger"
                    disabled={action.pending}
                    onClick={() => {
                      action.clear();
                      setRemove(comment.id);
                    }}
                  >
                    Xóa bình luận
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {canWrite(role) && !editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await dispatch({ type: 'addComment', memoryId, text: newText });
              setNewText('');
              setNotice('Đã đăng bình luận.');
            });
          }}
        >
          <Textarea
            label="Bình luận mới"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            required
            maxLength={5000}
            disabled={action.pending}
          />
          <Button type="submit" disabled={action.pending}>
            Đăng bình luận
          </Button>
        </form>
      )}
      {action.error && !remove && <Alert>{action.error}</Alert>}
      <Toast>{notice}</Toast>
      <ConfirmDialog
        open={!!remove}
        title="Xóa bình luận?"
        description="Bình luận này sẽ bị xóa khỏi kỷ niệm local."
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
