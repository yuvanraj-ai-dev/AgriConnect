const express = require('express');
const multer = require('multer');
const { randomUUID } = require('node:crypto');
const { v2: cloudinary } = require('cloudinary');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const { route, check } = require('../http');

const router = express.Router();
const image = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });

router.post('/images', authenticateToken, requireRole(['FARMER', 'VENDOR']), image.single('image'), route(async (req, res) => {
  check(process.env.CLOUDINARY_URL, 503, 'Photo uploads are not configured.');
  const data = req.file?.buffer;
  const start = data?.subarray(0, 12).toString('hex') || '';
  check(start.startsWith('ffd8ff') || start.startsWith('89504e470d0a1a0a') ||
    /^52494646[a-f0-9]{8}57454250/.test(start), 400, 'Choose a JPEG, PNG or WebP image.');
  const uploaded = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      resource_type: 'image', public_id: 'listing-photos/' + randomUUID(), allowed_formats: ['jpg', 'png', 'webp'],
      transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
    }, (error, value) => error ? reject(error) : resolve(value)).end(data);
  });
  res.status(201).json({ url: uploaded.secure_url });
}));

module.exports = router;
