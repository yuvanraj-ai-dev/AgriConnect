const { createReadStream } = require('node:fs');
const { mkdir, writeFile, unlink, access } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { v2: cloudinary } = require('cloudinary');
const { check } = require('./http');

const localDir = () => resolve(process.env.SOIL_REPORT_DIRECTORY || '.soil-reports');

function cloudConfigured() {
  if (!process.env.CLOUDINARY_URL) {
    check(process.env.NODE_ENV !== 'production', 503, 'Soil report storage is not configured.');
    return false;
  }
  return true;
}

async function save(buffer) {
  const name = randomUUID() + '.pdf';
  if (!cloudConfigured()) {
    await mkdir(localDir(), { recursive: true });
    await writeFile(join(localDir(), name), buffer, { flag: 'wx' });
    return name;
  }
  const result = await new Promise((resolveUpload, reject) => {
    cloudinary.uploader.upload_stream({
      public_id: 'soil-reports/' + name, resource_type: 'raw', type: 'authenticated', overwrite: false,
    }, (error, result) => error ? reject(error) : resolveUpload(result)).end(buffer);
  });
  return result.public_id;
}

async function open(ref) {
  if (!cloudConfigured()) {
    await access(join(localDir(), ref));
    return createReadStream(join(localDir(), ref));
  }
  const link = cloudinary.utils.private_download_url(ref, '', {
    resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60,
  });
  const response = await fetch(link, { signal: AbortSignal.timeout(20000) });
  check(response.ok && response.body, 502, 'The report could not be retrieved. Try again later.');
  return Readable.fromWeb(response.body);
}

async function remove(ref) {
  if (!cloudConfigured()) return unlink(join(localDir(), ref));
  return cloudinary.uploader.destroy(ref, { resource_type: 'raw', type: 'authenticated' });
}

module.exports = { save, open, remove };
