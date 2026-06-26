require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { HFProvider } = require('./providers/hf-provider');

const app = express();
const PORT = process.env.PORT || 3001;

// Use /tmp/ for writable dirs on serverless (Vercel), local dir otherwise
const isServerless = process.env.VERCEL === '1';
const DATA_DIR = isServerless ? '/tmp/image-to-video' : __dirname;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use('/results', express.static(path.join(DATA_DIR, 'results')));

// Serve frontend static files (relative to backend dir)
const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Ensure writable directories exist (silently skip on serverless if /tmp/ fails)
try {
  ['uploads', 'results'].forEach(dir => {
    const p = path.join(DATA_DIR, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
} catch (e) {
  console.warn('[Server] Could not create data dirs (serverless ok):', e.message);
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

let hfProvider = null;

function initHFProvider(apiKey) {
  if (apiKey) {
    hfProvider = new HFProvider(apiKey);
    console.log('[Server] HF API Provider ready');
    return true;
  }
  hfProvider = null;
  console.log('[Server] HF Token not set');
  return false;
}

initHFProvider(process.env.HF_TOKEN);

const jobs = new Map();

app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir görsel yükleyin.' });
    }

    const imagePath = req.file.path;
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

    if (!hfProvider) {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = 'HF Token ayarlanmamış. Lütfen ayarlardan token girin.';
      }
      return;
    }

    await hfProvider.generateVideo(jobId, imagePath, {
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
          console.log('[Server] Job ' + jobId + ' completed');
        }
      },
      onError: (error) => {
        const j = jobs.get(jobId);
        if (j) {
          j.status = 'failed';
          j.error = error.message || 'Video oluşturma başarısız oldu';
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
    return res.status(400).json({ error: 'HF Token gerekli' });
  }
  const enabled = initHFProvider(apiKey);
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
    hfEnabled: !!hfProvider,
    uptime: process.uptime()
  });
});

app.get('/api/samples', (req, res) => {
  res.json({
    scenes: [
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m1.jpg', name: 'Sahne 1' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m2.jpg', name: 'Sahne 2' },
      { url: 'https://a2e-prod-jumpy.makefun.ai/stable/sample/virtualTryOn/m3.jpg', name: 'Sahne 3' }
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Export for Vercel serverless
module.exports = app;

// Start server only when run directly (not imported by Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('Image to Video API running on http://localhost:' + PORT);
    console.log('HF API: ' + (hfProvider ? 'ready' : 'token not set'));
  });
}
