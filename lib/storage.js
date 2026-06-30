/**
 * Supabase Storage 업로드 (서버 전용, service_role 키 사용)
 * base64 이미지 → 공개 버킷 업로드 → 공개 URL 반환
 */

const { getConfig } = require('./supabase');

const DEFAULT_BUCKET = 'travel-diary';

function extensionFromMime(mimeType) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[(mimeType || '').toLowerCase()] || 'png';
}

function buildObjectPath(prefix, mimeType) {
  const ext = extensionFromMime(mimeType);
  const safePrefix = String(prefix || 'image')
    .replace(/[^a-zA-Z0-9가-힣_-]/g, '-')
    .slice(0, 40);
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safePrefix}-${stamp}.${ext}`;
}

async function uploadImage({ base64, mimeType, prefix, bucket = DEFAULT_BUCKET }) {
  const { url, key, configured } = getConfig();

  if (!configured) {
    return { error: 'Supabase가 설정되지 않아 이미지를 업로드할 수 없습니다.' };
  }

  if (!base64) {
    return { error: '업로드할 이미지 데이터가 없습니다.' };
  }

  const objectPath = buildObjectPath(prefix, mimeType);
  const buffer = Buffer.from(base64, 'base64');

  let response;
  try {
    response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': mimeType || 'image/png',
        'x-upsert': 'true',
        'cache-control': 'public, max-age=31536000',
      },
      body: buffer,
    });
  } catch (err) {
    console.error('[storage]', err.message);
    return { error: 'Storage 업로드 연결에 실패했습니다.' };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.message || data?.error || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    console.error('[storage] upload failed:', response.status, detail);
    return { error: `이미지 업로드에 실패했습니다. (${detail || response.status})` };
  }

  const publicUrl = `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
  return { url: publicUrl, path: objectPath, bucket };
}

module.exports = {
  DEFAULT_BUCKET,
  uploadImage,
};
