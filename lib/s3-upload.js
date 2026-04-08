// S3 upload utilities — loaded as a plain <script> in admin.html.
// Requires /api/upload-url to be available (Vercel serverless function).
//
// Exports (on window):
//   s3Upload(file, folder)                          → Promise<{ url, key }>
//   s3UploadBlob(blob, filename, folder)            → Promise<{ url, key }>
//   s3UploadWithProgress(file, folder, onProgress)  → Promise<{ url, key }>

function _s3Key(filename, folder) {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase();
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}

async function _presign(key, contentType) {
  const params = new URLSearchParams({ key, contentType });
  const res = await fetch(`/api/upload-url?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Presign failed: ' + body);
  }
  return res.json(); // { uploadUrl, cdnUrl }
}

async function s3Upload(file, folder) {
  const key = _s3Key(file.name, folder);
  const ct  = file.type || 'application/octet-stream';
  const { uploadUrl, cdnUrl } = await _presign(key, ct);
  const put = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': ct },
    body:    file,
  });
  if (!put.ok) throw new Error('S3 upload failed (' + put.status + ')');
  return { url: cdnUrl, key };
}

async function s3UploadBlob(blob, filename, folder) {
  const key = _s3Key(filename, folder);
  const ct  = blob.type || 'application/octet-stream';
  const { uploadUrl, cdnUrl } = await _presign(key, ct);
  const put = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': ct },
    body:    blob,
  });
  if (!put.ok) throw new Error('S3 upload failed (' + put.status + ')');
  return { url: cdnUrl, key };
}

function s3UploadWithProgress(file, folder, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const key = _s3Key(file.name, folder);
      const ct  = file.type || 'application/octet-stream';
      const { uploadUrl, cdnUrl } = await _presign(key, ct);

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
          reject(new Error('S3 upload failed (' + xhr.status + ')'));
        }
      };
      xhr.onerror = () => reject(new Error('S3 upload network error'));
      xhr.send(file);
    } catch (err) {
      reject(err);
    }
  });
}

window.s3Upload             = s3Upload;
window.s3UploadBlob         = s3UploadBlob;
window.s3UploadWithProgress = s3UploadWithProgress;
