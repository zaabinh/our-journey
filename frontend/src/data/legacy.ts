import type { ImportPlan, Photo } from '../domain/types';
import { canonical, checksum, decode, preparePhoto } from './codec';
import { dateOnly, text } from '../domain/policy';
export async function dryRunLegacy(
  raw: string,
  options: {
    source: string;
    albumId: string;
    owners: Record<string, string>;
    files?: Record<string, Blob>;
    onProgress?: (processed: number, total: number) => void;
  },
): Promise<ImportPlan> {
  const plan: ImportPlan = { records: [], errors: [], warnings: [] };
  try {
    if (raw.length > 200 * 1024 * 1024) throw Error('JSON vượt giới hạn 200 MB.');
    text(options.source, 200, true);
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 1000)
      throw Error('Cần JSON array, tối đa 1000 record mỗi lần.');
    const seen = new Map<string, string>(),
      photoCache = new WeakMap<Blob, Promise<Photo>>();
    let bytes = 0;
    options.onProgress?.(0, data.length);
    for (const [index, value] of data.entries()) {
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw Error('Record không hợp lệ.');
        const r = value as Record<string, unknown>;
        if (
          (typeof r.id !== 'string' && typeof r.id !== 'number') ||
          !String(r.id).trim() ||
          String(r.id).length > 200
        )
          throw Error('Legacy ID không hợp lệ.');
        if (/"(?:password|session|access_token|refresh_token)"\s*:/i.test(JSON.stringify(r)))
          throw Error('Record chứa trường tài khoản nhạy cảm; không import.');
        const owner = typeof r.owner === 'string' ? r.owner : '__unassigned__';
        if (!Object.hasOwn(options.owners, owner) || !options.owners[owner])
          throw Error('Cần xác nhận mapping owner, kể cả owner trống.');
        if (typeof r.date !== 'string') throw Error('Ngày legacy phải là văn bản để giữ nguyên.');
        const date = dateOnly(r.date) ? r.date : '';
        const dateLabel = date ? undefined : text(r.date, 200);
        const images = r.images ?? (r.image ? [r.image] : []);
        if (!Array.isArray(images) || !images.length || images.length > 50)
          throw Error('Cần 1–50 ảnh mỗi record.');
        const photos = [];
        for (const image of images) {
          if (typeof image !== 'string') throw Error('Tham chiếu ảnh không hợp lệ.');
          let blob: Blob;
          if (image.startsWith('data:')) {
            const m = /^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(image);
            if (!m || m[2].length > 28 * 1024 * 1024) throw Error('Data URL không hợp lệ/quá lớn.');
            blob = new Blob([decode(m[2])], { type: m[1] });
          } else {
            const p = image.replaceAll('\\', '/');
            if (
              /^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(p) ||
              p.split('/').some((x) => x === '..' || x === '.') ||
              /[%?#]/.test(p) ||
              p.includes(String.fromCharCode(0))
            )
              throw Error('Đường dẫn ảnh không an toàn; không truy cập URL.');
            if (!Object.hasOwn(options.files ?? {}, image))
              throw Error('Thiếu file trong mapping đã chọn.');
            blob = options.files![image];
          }
          bytes += blob.size;
          if (bytes > 200 * 1024 * 1024) throw Error('Tổng ảnh vượt 200 MB.');
          if (!photoCache.has(blob)) photoCache.set(blob, preparePhoto(blob));
          photos.push(await photoCache.get(blob)!);
        }
        const [hash, key] = await Promise.all([
          checksum(canonical(r)),
          checksum(canonical([options.source, String(r.id)])),
        ]);
        if (seen.has(key)) {
          if (seen.get(key) !== hash) throw Error('Trùng legacy ID nhưng khác nội dung.');
          plan.warnings.push(
            `Record ${index + 1}: trùng ID/nội dung, giữ một bản theo checkpoint.`,
          );
          continue;
        }
        seen.set(key, hash);
        const animations =
          r.animations && typeof r.animations === 'object' && !Array.isArray(r.animations)
            ? (r.animations as Record<string, unknown>)
            : {};
        plan.records.push({
          key,
          hash,
          albumId: options.albumId,
          authorId: options.owners[owner],
          legacy: r,
          order: typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : index,
          draft: {
            title: text(r.title, 160, true),
            date,
            dateLabel,
            location: text(r.location ?? '', 300),
            note: text(r.note ?? '', 20000),
            animations,
          },
          photos,
        });
      } catch (e) {
        plan.errors.push({
          index,
          reason: e instanceof Error ? e.message : 'Không thể đọc record.',
        });
      } finally {
        if ((index + 1) % 20 === 0 || index + 1 === data.length)
          options.onProgress?.(index + 1, data.length);
      }
    }
  } catch (e) {
    plan.errors.push({ index: -1, reason: e instanceof Error ? e.message : 'JSON không hợp lệ.' });
  }
  return plan;
}
