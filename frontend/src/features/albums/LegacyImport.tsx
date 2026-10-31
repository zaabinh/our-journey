import { useState } from 'react';
import type { ImportPlan } from '../../domain/types';
import { dryRunLegacy } from '../../data/legacy';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { useUnsavedChanges } from '../../app/useUnsavedChanges';
import { Alert, Button, Dropdown, Input, Toast } from '../../components/ui';
type ImportProgress = {
  phase: 'reading' | 'checking' | 'verifying' | 'saving';
  current: number;
  total: number;
};
const progressLabel: Record<ImportProgress['phase'], string> = {
  reading: 'Đang đọc file…',
  checking: 'Đang kiểm tra record và ảnh…',
  verifying: 'Đang xác minh checksum…',
  saving: 'Đang lưu theo từng nhóm…',
};
export function LegacyImport({ albumId }: { albumId: string }) {
  const { repo, actor, state, perform } = useJourney(),
    action = useAction();
  const [raw, setRaw] = useState(''),
    [source, setSource] = useState(''),
    [owners, setOwners] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [references, setReferences] = useState<string[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [paths, setPaths] = useState<Record<string, string>>({}),
    [plan, setPlan] = useState<ImportPlan>(),
    [notice, setNotice] = useState(''),
    [progress, setProgress] = useState<ImportProgress>(),
    [done, setDone] = useState(false);
  useUnsavedChanges(!!raw && !done);
  return (
    <details className="data-tools">
      <summary>Nhập dữ liệu cũ từ file riêng</summary>
      <p>
        Chỉ chọn bản sao export đã lưu an toàn. Không đọc DB cũ hoặc truy cập URL ảnh. Mỗi owner và
        đường dẫn ảnh cần mapping rõ trước khi nhập; hãy dùng fixture khi chưa có export origin cũ.
      </p>
      <div className="field">
        <label htmlFor="legacy-json">JSON legacy (tối đa 200 MB)</label>
        <input
          id="legacy-json"
          type="file"
          accept=".json,application/json"
          disabled={action.pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setRaw('');
            setPlan(undefined);
            setNotice('');
            setDone(false);
            setProgress({ phase: 'reading', current: 0, total: 0 });
            action.clear();
            void action.run(async () => {
              try {
                if (file.size > 200 * 1024 * 1024) throw Error('JSON vượt 200 MB.');
                const content = await file.text(),
                  data: unknown = JSON.parse(content);
                if (!Array.isArray(data)) throw Error('Cần JSON array legacy.');
                const records = data.filter((v) => v && typeof v === 'object') as Record<
                  string,
                  unknown
                >[];
                setOwners([
                  ...new Set(
                    records.map((r) => (typeof r.owner === 'string' ? r.owner : '__unassigned__')),
                  ),
                ]);
                setReferences([
                  ...new Set(
                    records
                      .flatMap((r) =>
                        Array.isArray(r.images) ? r.images : r.image ? [r.image] : [],
                      )
                      .filter((v): v is string => typeof v === 'string' && !v.startsWith('data:')),
                  ),
                ]);
                setRaw(content);
                setSource(file.name);
                setMapping({});
                setPaths({});
                setPlan(undefined);
                setNotice(`Đã đọc ${records.length} record. Hãy xác nhận mapping trước khi nhập.`);
                setDone(false);
              } finally {
                setProgress(undefined);
              }
            });
          }}
        />
      </div>
      {raw && (
        <>
          <Input
            label="Mã nguồn nhập (giữ nguyên khi nhập lại)"
            value={source}
            disabled={action.pending}
            maxLength={200}
            onChange={(e) => {
              setSource(e.target.value);
              setPlan(undefined);
            }}
          />
          {owners.map((owner) => (
            <Dropdown
              key={owner}
              disabled={action.pending}
              label={`Gán chủ sở hữu: ${owner === '__unassigned__' ? '(chưa có)' : owner || '(trống)'}`}
              value={mapping[owner] ?? ''}
              onChange={(value) => {
                setMapping((m) => ({ ...m, [owner]: value }));
                setPlan(undefined);
              }}
              options={[
                { value: '', label: 'Chọn danh tính sau khi xác nhận' },
                ...state!.users.map((u) => ({ value: u.id, label: u.name })),
              ]}
            />
          ))}
          {references.length > 0 && (
            <>
              <div className="field">
                <label htmlFor="legacy-photos">Chọn các file ảnh tương ứng</label>
                <input
                  id="legacy-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={action.pending}
                  onChange={(e) => {
                    setFiles([...(e.target.files ?? [])]);
                    setPaths({});
                    setPlan(undefined);
                  }}
                />
              </div>
              {references.map((ref) => (
                <Dropdown
                  key={ref}
                  disabled={action.pending}
                  label={`Ảnh cho: ${ref}`}
                  value={paths[ref] ?? ''}
                  onChange={(value) => {
                    setPaths((p) => ({ ...p, [ref]: value }));
                    setPlan(undefined);
                  }}
                  options={[
                    { value: '', label: 'Chọn file tương ứng' },
                    ...files.map((f, i) => ({ value: String(i), label: `${f.name} (${i + 1})` })),
                  ]}
                />
              ))}
            </>
          )}
          <Button
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                const selected: Record<string, Blob> = {};
                for (const [ref, index] of Object.entries(paths))
                  if (index !== '' && files[Number(index)]) selected[ref] = files[Number(index)];
                setProgress({ phase: 'checking', current: 0, total: 0 });
                try {
                  const next = await dryRunLegacy(raw, {
                    source,
                    albumId,
                    owners: mapping,
                    files: selected,
                    onProgress: (current, total) =>
                      setProgress({ phase: 'checking', current, total }),
                  });
                  setPlan(next);
                  setNotice(
                    next.errors.length
                      ? `Kiểm tra xong: ${next.records.length} record dùng được, ${next.errors.length} lỗi cần sửa.`
                      : `Kiểm tra thành công ${next.records.length} record. Hãy rà soát rồi xác nhận nhập.`,
                  );
                  setDone(false);
                } finally {
                  setProgress(undefined);
                }
              })
            }
          >
            {action.pending ? 'Đang xử lý…' : 'Kiểm tra trước khi nhập'}
          </Button>
          {plan && (
            <>
              <p>
                {plan.records.length} record sẵn sàng; {plan.errors.length} lỗi.
              </p>
              {plan.errors.length > 0 && (
                <Alert>
                  <ul>
                    {plan.errors.map((e, i) => (
                      <li key={i}>
                        Record {e.index + 1}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
              {plan.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              <Button
                disabled={action.pending || !!plan.errors.length || !plan.records.length}
                onClick={() =>
                  void action.run(async () => {
                    setNotice('');
                    setProgress({ phase: 'verifying', current: 0, total: plan.records.length });
                    try {
                      const result = await perform(() =>
                        repo.importBatch(actor, plan, 20, (current, total, stage) =>
                          setProgress({
                            phase: stage === 'verify' ? 'verifying' : 'saving',
                            current,
                            total,
                          }),
                        ),
                      );
                      setNotice(
                        `Nhập thành công: ${result.imported} record mới; ${result.skipped} record đã có được bỏ qua.`,
                      );
                      setDone(true);
                    } finally {
                      setProgress(undefined);
                    }
                  })
                }
              >
                {action.pending ? 'Đang nhập…' : 'Xác nhận mapping và nhập'}
              </Button>
            </>
          )}
        </>
      )}
      {action.error && (
        <Alert>{action.error} Có thể chạy lại để tiếp tục từ checkpoint đã lưu.</Alert>
      )}
      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <p>
            {progressLabel[progress.phase]}
            {progress.total > 0 ? ` ${progress.current}/${progress.total}` : ''}
          </p>
          {progress.total > 0 ? (
            <progress
              aria-label={progressLabel[progress.phase]}
              max={progress.total}
              value={progress.current}
            />
          ) : (
            <progress aria-label={progressLabel[progress.phase]} />
          )}
        </div>
      )}
      {!progress && !action.error && notice && <Toast>{notice}</Toast>}
    </details>
  );
}
