require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { HFProvider } = require('./providers/hf-provider');
const { AgnesBridge } = require('./providers/agnes-bridge');
const { MuapiBridge } = require('./providers/muapi-bridge');

const app = express();
const PORT = process.env.PORT || 3001;

const isServerless = process.env.VERCEL === '1';
const DATA_DIR = isServerless ? '/tmp/image-to-video' : __dirname;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use('/results', express.static(path.join(DATA_DIR, 'results')));

const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

try {
  ['uploads', 'results'].forEach(dir => {
    const p = path.join(DATA_DIR, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
} catch (e) {
  console.warn('[Server] Could not create data dirs:', e.message);
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

const providers = [];
const providerLabels = {};

function initHFProvider(apiKey) {
  if (apiKey) {
    providers.push({ name: 'hf', label: 'HuggingFace SVD', handler: new HFProvider(apiKey) });
    providerLabels.hf = 'HuggingFace SVD';
    console.log('[Server] HF API Provider ready');
    return true;
  }
  console.log('[Server] HF Token not set');
  return false;
}

function initAgnesProvider(apiKey) {
  if (apiKey) {
    providers.push({ name: 'agnes', label: 'Agnes AI', handler: new AgnesBridge(apiKey) });
    providerLabels.agnes = 'Agnes AI';
    console.log('[Server] Agnes AI Provider ready');
    return true;
  }
  console.log('[Server] Agnes API Key not set');
  return false;
}

function initMuapiProvider(apiKey) {
  if (apiKey) {
    providers.push({ name: 'muapi', label: 'HappyHorse', handler: new MuapiBridge(apiKey) });
    providerLabels.muapi = 'HappyHorse';
    console.log('[Server] Muapi/HappyHorse Provider ready');
    return true;
  }
  console.log('[Server] Muapi API Key not set');
  return false;
}

initHFProvider(process.env.HF_TOKEN);
initAgnesProvider(process.env.AGNES_API_KEY);
initMuapiProvider(process.env.MUAPI_API_KEY);

const jobs = new Map();

app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lutfen bir gorsel yukleyin.' });
    }

    const imagePath = req.file.path;
    const jobId = uuidv4();

    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      resultUrl: null,
      error: null,
      provider: null,
      providerLabel: null,
      errors: []
    };
    jobs.set(jobId, job);
    res.json({ jobId, status: 'queued' });

    if (providers.length === 0) {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = 'Hicbir saglayici yapilandirilmamis. Ayarlardan API key girin.';
      }
      return;
    }

    let lastError = null;
    for (const provider of providers) {
      const j = jobs.get(jobId);
      if (!j) return;

      j.provider = provider.name;
      j.providerLabel = provider.label;
      j.status = 'processing';
      j.progress = 0;

      console.log(`[Server] Trying provider: ${provider.label}`);

      try {
        await new Promise((resolve, reject) => {
          provider.handler.generate(jobId, imagePath, {
            onProgress: (progress) => {
              const jj = jobs.get(jobId);
              if (jj) jj.progress = progress;
            },
            onComplete: (resultPath) => {
              const jj = jobs.get(jobId);
              if (jj) {
                jj.status = 'completed';
                jj.progress = 100;
                jj.resultUrl = `/results/${path.basename(resultPath)}`;
                console.log(`[Server] Job ${jobId} completed via ${provider.label}`);
              }
              resolve();
            },
            onError: (error) => {
              reject(error);
            }
          });
        });
        return;
      } catch (err) {
        lastError = err;
        const jj = jobs.get(jobId);
        if (jj) {
          jj.errors.push(`${provider.name}: ${err.message}`);
        }
        console.log(`[Server] ${provider.label} failed, trying next...`);
      }
    }

    const j = jobs.get(jobId);
    if (j) {
      j.status = 'failed';
      j.error = lastError?.message || 'Tum saglayicilar basarisiz';
    }
  } catch (error) {
    console.error('Generate error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/api/set-key', (req, res) => {
  const { provider, apiKey } = req.body;
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'Provider adi ve API key gerekli' });
  }
  let enabled = false;
  if (provider === 'hf') enabled = initHFProvider(apiKey);
  else if (provider === 'agnes') enabled = initAgnesProvider(apiKey);
  else if (provider === 'muapi') enabled = initMuapiProvider(apiKey);
  res.json({ success: true, provider, enabled: !!enabled });
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
    provider: job.provider,
    providerLabel: job.providerLabel,
    errors: job.errors,
    createdAt: job.createdAt
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    providers: providers.map(p => ({ name: p.name, label: p.label, enabled: true })),
    uptime: process.uptime()
  });
});

app.get('/api/providers', (req, res) => {
  const providerStatus = [
    { name: 'hf', label: 'HuggingFace SVD', enabled: providers.some(p => p.name === 'hf'), available: !!process.env.HF_TOKEN },
    { name: 'agnes', label: 'Agnes AI', enabled: providers.some(p => p.name === 'agnes'), available: !!process.env.AGNES_API_KEY },
    { name: 'muapi', label: 'HappyHorse', enabled: providers.some(p => p.name === 'muapi'), available: !!process.env.MUAPI_API_KEY }
  ];
  res.json({ providers: providerStatus });
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

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log(`Image to Video API running on http://localhost:${PORT}`);
    console.log('');
    console.log('Provider Chain:');
    if (providers.length === 0) {
      console.log('  !  No providers configured. Set API keys in .env');
    }
    providers.forEach(p => {
      console.log(`  - ${p.label}`);
    });
    console.log('');
  });
}
