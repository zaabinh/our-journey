import { useState } from 'react';
import { useAction, useJourney } from '../../app/JourneyProvider';
import { Alert, Button, Toast } from '../../components/ui';
function download(raw: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'our-journey-local-backup.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DataTools() {
  const { repo, perform } = useJourney(),
    action = useAction();
  const [file, setFile] = useState<File>(),
    [notice, setNotice] = useState('');
  return (
    <details className="data-tools">
      <summary>Sao lưu và phục hồi dữ liệu local</summary>
      <p>
        Bản sao chứa toàn bộ datastore demo trên thiết bị này, gồm các danh tính và album. Lưu file
        riêng ngoài Git. Trình duyệt không thay thế bản sao lưu bền vững.
      </p>
      <Button
        disabled={action.pending}
        onClick={() =>
          void action.run(async () => {
            download(await repo.exportBackup());
            setNotice('Đã chuẩn bị file tải xuống. Hãy lưu bản sao ở nơi riêng tư.');
          })
        }
      >
        Xuất bản sao local
      </Button>
      <div className="field">
        <label htmlFor="restore-file">Chọn bản sao schema mới</label>
        <input
          id="restore-file"
          type="file"
          accept=".json,application/json"
          disabled={action.pending}
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </div>
      <p>
        Phục hồi sẽ gộp dữ liệu; ID khác nội dung sẽ báo conflict, dữ liệu hiện tại được giữ nguyên.
      </p>
      <Button
        variant="secondary"
        disabled={!file || action.pending}
        onClick={() =>
          void action.run(async () => {
            if (!file || file.size > 300 * 1024 * 1024) throw Error('Chọn JSON tối đa 300 MB.');
            const content = await file.text();
            await perform(() => repo.restoreBackup(content));
            setNotice('Đã phục hồi và đối chiếu bản sao local.');
          })
        }
      >
        Phục hồi bản sao
      </Button>
      {action.error && <Alert>{action.error}</Alert>}
      <Toast>{notice}</Toast>
    </details>
  );
}
