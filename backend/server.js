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
const DATA_DIR = __dirname;

app.use(cors());
app.use(express.json());

['uploads', 'results'].forEach(dir => {
  const p = path.join(DATA_DIR, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use('/results', express.static(path.join(DATA_DIR, 'results')));

const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(DATA_DIR, 'uploads')),
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
let bflKey = process.env.BFL_API_KEY || '';
if (bflKey) {
  bflProvider = new BFLProvider(bflKey);
  console.log('[Server] BFL Provider ready');
}

const jobs = new Map();

app.post('/api/generate', upload.fields([
  { name: 'modelImage', maxCount: 1 },
  { name: 'clothImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const modelFile = req.files && req.files.modelImage && req.files.modelImage[0];
    const clothFile = req.files && req.files.clothImage && req.files.clothImage[0];

    if (!modelFile || !clothFile) {
      return res.status(400).json({ error: 'Both model and cloth images required' });
    }

    if (!bflProvider) {
      return res.status(400).json({ error: 'BFL API not configured. Set API key in settings.' });
    }

    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null,
      modelPreview: '/uploads/' + path.basename(modelFile.path),
      clothPreview: '/uploads/' + path.basename(clothFile.path)
    };
    jobs.set(jobId, job);
    res.json({ jobId, status: 'queued' });

    bflProvider.generate(jobId, modelFile.path, clothFile.path, {
      onProgress: (progress) => {
        const j = jobs.get(jobId);
        if (j) j.progress = progress;
      },
      onComplete: (resultPath) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'completed';
          j.progress = 100;
          j.resultUrl = '/results/' + path.basename(resultPath);
          console.log('[Server] Job ' + jobId + ' completed');
        }
      },
      onError: (error) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'failed';
          j.error = error.message;
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

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    resultUrl: job.resultUrl,
    error: job.error,
    modelPreview: job.modelPreview,
    clothPreview: job.clothPreview,
    createdAt: job.createdAt
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    bflEnabled: !!bflProvider,
    uptime: process.uptime()
  });
});

app.post('/api/set-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }
  bflKey = apiKey;
  bflProvider = new BFLProvider(apiKey);
  console.log('[Server] BFL API key updated');
  res.json({ success: true, enabled: true });
});

app.get('/api/samples', (req, res) => {
  res.json({
    models: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg', name: 'Model 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg', name: 'Model 2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg', name: 'Model 3' }
    ],
    clothes: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/c1.jpg', name: 'T-shirt 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/c2.jpg', name: 'T-shirt 2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/c3.jpg', name: 'T-shirt 3' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/c4.jpg', name: 'Jacket 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/c5.jpg', name: 'Dress 1' }
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('Cloth Swap API running on http://localhost:' + PORT);
    console.log('BFL Provider: ' + (bflProvider ? 'READY' : 'NOT CONFIGURED (set BFL_API_KEY)'));
    console.log('');
  });
}
