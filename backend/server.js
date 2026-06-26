require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { BFLProvider } = require('./providers/bfl-provider');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/results', express.static(path.join(__dirname, 'results')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

['uploads', 'results'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error('Only jpg/png/webp images allowed'));
  }
});

let bflProvider = null;

function initBFLProvider(apiKey) {
  if (apiKey) {
    bflProvider = new BFLProvider(apiKey);
    console.log('[Server] BFL API Provider ready');
    return true;
  }
  bflProvider = null;
  console.log('[Server] BFL API Key not set');
  return false;
}

initBFLProvider(process.env.BFL_API_KEY);

const jobs = new Map();

app.post('/api/generate', upload.fields([
  { name: 'modelImage', maxCount: 1 },
  { name: 'clothImage', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files?.modelImage?.[0]) {
      return res.status(400).json({ error: 'Lütfen bir model fotoğrafı yükleyin.' });
    }
    if (!req.files?.clothImage?.[0]) {
      return res.status(400).json({ error: 'Lütfen bir kıyafet fotoğrafı yükleyin.' });
    }

    const modelPath = req.files.modelImage[0].path;
    const clothPath = req.files.clothImage[0].path;
    const jobId = uuidv4();

    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null
    };
    jobs.set(jobId, job);
    res.json({ jobId, status: 'queued' });

    if (!bflProvider) {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = 'BFL API Key ayarlanmamış. Lütfen ayarlardan API Key girin.';
      }
      return;
    }

    await bflProvider.generate(jobId, modelPath, clothPath, {
      onProgress: (progress) => {
        const j = jobs.get(jobId);
        if (j) j.progress = progress;
      },
      onComplete: (resultPath) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'completed';
          j.progress = 100;
          j.resultUrl = `/results/${path.basename(resultPath)}`;
          console.log('[Server] BFL job ' + jobId + ' completed');
        }
      },
      onError: (error) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'failed';
          j.error = error.message || 'Görsel oluşturma başarısız oldu';
        }
      }
    });

  } catch (error) {
    console.error('Generate error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/set-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API Key gerekli' });
  }
  const enabled = initBFLProvider(apiKey);
  res.json({ success: true, enabled });
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    resultUrl: job.resultUrl,
    error: job.error,
    createdAt: job.createdAt
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    bflEnabled: !!bflProvider,
    uptime: process.uptime()
  });
});

app.get('/api/samples', (req, res) => {
  res.json({
    models: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg', name: 'Model 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg', name: 'Model 2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg', name: 'Model 3' }
    ],
    clothes: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/t-shirt.png', name: 'Tişört' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/dress.png', name: 'Elbise' }
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('Cloth Swap API running on http://localhost:' + PORT);
  console.log('BFL API: ' + (bflProvider ? 'ready' : 'key not set'));
});
