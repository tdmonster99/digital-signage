// S3 upload utilities — loaded as a plain <script> in admin.html.
// Requires /api/upload-url to be available (Vercel serverless function).
//
// Exports (on window):
//   s3Upload(file, folder)                          → Promise<{ url, key }>
//   s3UploadBlob(blob, filename, folder)            → Promise<{ url, key }>
//   s3UploadWithProgress(file, folder, onProgress)  → Promise<{ url, key }>

// Hard upload caps — protect S3 egress and presigned-PUT bandwidth.
// Friendlier per-context caps live in callers (e.g. handleFiles).
const MAX_IMAGE_BYTES = 50  * 1024 * 1024;   //  50 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;   // 500 MB
const MAX_OTHER_BYTES = 100 * 1024 * 1024;   // 100 MB (PDFs, fonts, etc.)

function _formatBytes(n) {
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (n >= 1024 * 1024)        return Math.round(n / (1024 * 1024)) + ' MB';
  if (n >= 1024)               return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function _enforceSize(file, contentType) {
  const size = file?.size ?? 0;
  if (!size) throw new Error('Empty file — cannot upload a zero-byte file.');
  const ct = (contentType || file.type || '').toLowerCase();
  let cap = MAX_OTHER_BYTES, kind = 'file';
  if (ct.startsWith('image/'))      { cap = MAX_IMAGE_BYTES; kind = 'image'; }
  else if (ct.startsWith('video/')) { cap = MAX_VIDEO_BYTES; kind = 'video'; }
  if (size > cap) {
    throw new Error(`This ${kind} is ${_formatBytes(size)} — the limit is ${_formatBytes(cap)}.`);
  }
}

function _s3Key(filename, folder) {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}

async function _presign(key, contentType, size) {
  const params = new URLSearchParams({ key, contentType, size: String(size || 0) });
  const res = await fetch(`/api/upload-url?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Presign failed: ' + body);
  }
  return res.json(); // { uploadUrl, cdnUrl }
}

function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file for upload.'));
    reader.readAsDataURL(blob);
  });
}

async function _uploadViaProxy(blob, key, contentType) {
  const dataBase64 = await _blobToBase64(blob);
  const res = await fetch('/api/upload-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType, dataBase64 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Server upload failed: ' + (body || res.status));
  }
  const data = await res.json();
  return { url: data.cdnUrl || data.url, key: data.key || key };
}

async function _putPresignedOrProxy(blob, key, contentType, uploadUrl, cdnUrl) {
  try {
    const put = await fetch(uploadUrl, {
      method:  'PUT',
      headers: { 'Content-Type': contentType },
      body:    blob,
    });
    if (!put.ok) throw new Error('S3 upload failed (' + put.status + ')');
    return { url: cdnUrl, key };
  } catch (err) {
    console.warn('Direct S3 upload failed; retrying through same-origin upload endpoint.', err);
    return _uploadViaProxy(blob, key, contentType);
  }
}

async function s3Upload(file, folder) {
  const ct  = file.type || 'application/octet-stream';
  _enforceSize(file, ct);
  const key = _s3Key(file.name, folder);
  const { uploadUrl, cdnUrl } = await _presign(key, ct, file.size);
  return _putPresignedOrProxy(file, key, ct, uploadUrl, cdnUrl);
}

async function s3UploadBlob(blob, filename, folder) {
  const ct  = blob.type || 'application/octet-stream';
  _enforceSize(blob, ct);
  const key = _s3Key(filename, folder);
  const { uploadUrl, cdnUrl } = await _presign(key, ct, blob.size);
  return _putPresignedOrProxy(blob, key, ct, uploadUrl, cdnUrl);
}

function s3UploadWithProgress(file, folder, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const ct  = file.type || 'application/octet-stream';
      _enforceSize(file, ct);
      const key = _s3Key(file.name, folder);
      const { uploadUrl, cdnUrl } = await _presign(key, ct, file.size);

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', ct);

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ url: cdnUrl, key });
        } else {
          _uploadViaProxy(file, key, ct).then(resolve, reject);
        }
      };
      xhr.onerror = () => _uploadViaProxy(file, key, ct).then(resolve, reject);
      xhr.send(file);
    } catch (err) {
      reject(err);
    }
  });
}

window.s3Upload             = s3Upload;
window.s3UploadBlob         = s3UploadBlob;
window.s3UploadWithProgress = s3UploadWithProgress;
