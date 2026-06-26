// === State ===
const state = {
  imageFile: null,
  imageDataUrl: null,
  jobId: null,
  polling: false,
  hfEnabled: false,
  selectedModel: 'svd'
};

// === DOM ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Upload
const imageDropZone = $('#imageDropZone');
const imageInput = $('#imageInput');
const imagePreview = $('#imagePreview');
const imagePlaceholder = $('#imagePlaceholder');
const imagePreviewImg = $('#imagePreviewImg');
const imageRemove = $('#imageRemove');

// Controls
const generateBtn = $('#generateBtn');
const generateHint = $('#generateHint');
const promptInput = $('#promptInput');
const promptCounter = $('#promptCounter');
const modelBtns = $$('.model-btn');

// Settings
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const settingsClose = $('#settingsClose');
const apiKeyInput = $('#apiKeyInput');
const apiSaveBtn = $('#apiSaveBtn');
const apiStatus = $('#apiStatus');
const statusDot = $('#statusDot');
const connectionStatus = $('#connectionStatus');

// Progress
const progressSection = $('#progressSection');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const progressProvider = $('#progressProvider');
const progressElapsed = $('#progressElapsed');
const progressEta = $('#progressEta');

// Result
const resultSection = $('#resultSection');
const resultSource = $('#resultSource');
const resultVideo = $('#resultVideo');
const downloadBtn = $('#downloadBtn');
const tryAgainBtn = $('#tryAgainBtn');
const resultBadge = $('#resultBadge');

// Theme
const themeToggle = $('#themeToggle');
const themeIcon = $('#themeIcon');

// Chain elements
const hfChain = $('#hfChain');
const fallbackChain = $('#fallbackChain');

// Error
const errorContainer = $('#errorContainer');

// === API Base ===
const API_BASE = '';

// === Theme ===
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

// === Initialize ===
async function init() {
  await checkStatus();
  updateGenerateBtn();
}

// === Status Check ===
async function checkStatus() {
  try {
    const resp = await fetch(`${API_BASE}/api/status`);
    const data = await resp.json();
    state.hfEnabled = data.hfEnabled;
    statusDot.className = `status-dot ${data.hfEnabled ? 'active' : ''}`;
    connectionStatus.title = data.hfEnabled ? 'HF API Hazır' : 'HF Token gerekli';
  } catch {
    statusDot.className = 'status-dot';
    connectionStatus.title = 'Sunucu bağlantısı yok';
  }
}

// === File Upload ===
const maxSize = 20 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

function handleImageFile(file) {
  if (!file) return;
  if (!allowedTypes.includes(file.type)) {
    showError('Desteklenmeyen dosya türü. İzin verilenler: jpg, png, webp');
    return;
  }
  if (file.size > maxSize) {
    showError('Dosya çok büyük. Maksimum 20MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreviewImg.src = e.target.result;
    imagePlaceholder.classList.add('hidden');
    imagePreview.classList.remove('hidden');
    state.imageFile = file;
    state.imageDataUrl = e.target.result;
    updateGenerateBtn();
    generateHint.textContent = '✅ Görsel yüklendi, video oluşturmaya hazır!';
  };
  reader.readAsDataURL(file);
}

imageDropZone.addEventListener('click', (e) => {
  if (e.target.closest('.remove-btn')) return;
  imageInput.click();
});

imageInput.addEventListener('change', () => {
  if (imageInput.files.length > 0) handleImageFile(imageInput.files[0]);
});

imageDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageDropZone.classList.add('drag-over');
});

imageDropZone.addEventListener('dragleave', () => {
  imageDropZone.classList.remove('drag-over');
});

imageDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  imageDropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleImageFile(e.dataTransfer.files[0]);
});

imageRemove.addEventListener('click', (e) => {
  e.stopPropagation();
  imagePreview.classList.add('hidden');
  imagePlaceholder.classList.remove('hidden');
  imagePreviewImg.src = '';
  imageInput.value = '';
  state.imageFile = null;
  state.imageDataUrl = null;
  updateGenerateBtn();
  generateHint.textContent = 'Görsel yükleyerek başlayın';
});

// === Prompt ===
promptInput.addEventListener('input', () => {
  const len = promptInput.value.length;
  promptCounter.textContent = `${len}/500`;
});

// Suggesstion chips
$$('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    promptInput.value = chip.dataset.prompt;
    promptCounter.textContent = `${promptInput.value.length}/500`;
    promptInput.focus();
  });
});

// === Model Selection ===
modelBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('disabled')) return;
    modelBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedModel = btn.dataset.model;
  });
});

// === Generate Button ===
function updateGenerateBtn() {
  const ready = state.imageFile;
  generateBtn.disabled = !ready;
}

// === Settings Modal ===
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  apiKeyInput.value = localStorage.getItem('hf_token') || '';
  apiStatus.textContent = '';
  apiStatus.className = 'api-status';
});

settingsClose.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

apiSaveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiStatus.textContent = '⚠️ Lütfen bir HF Token girin';
    apiStatus.className = 'api-status error';
    return;
  }

  apiSaveBtn.disabled = true;
  apiSaveBtn.textContent = 'Kaydediliyor...';

  try {
    const resp = await fetch(`${API_BASE}/api/set-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await resp.json();

    if (data.success) {
      localStorage.setItem('hf_token', key);
      state.hfEnabled = true;
      apiStatus.textContent = '✅ Token kaydedildi!';
      apiStatus.className = 'api-status success';
      statusDot.className = 'status-dot active';
      connectionStatus.title = 'HF API Hazır';
    } else {
      apiStatus.textContent = '⚠️ Token geçersiz';
      apiStatus.className = 'api-status error';
    }
  } catch (err) {
    apiStatus.textContent = '⚠️ Sunucuya bağlanılamadı';
    apiStatus.className = 'api-status error';
  } finally {
    apiSaveBtn.disabled = false;
    apiSaveBtn.textContent = 'Kaydet';
  }
});

// === Generate Handler ===
generateBtn.addEventListener('click', async () => {
  if (!state.imageFile) return;

  // Reset UI
  hideError();
  resultSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Sıraya alındı...';
  progressProvider.textContent = 'Stable Video Diffusion hazırlanıyor...';
  progressElapsed.textContent = '00:00';
  progressEta.classList.remove('hidden');
  progressEta.textContent = 'Bu işlem ~25 saniye sürebilir';
  generateBtn.disabled = true;
  generateBtn.querySelector('.btn-text').textContent = 'Video oluşturuluyor...';
  hfChain.className = 'chain-item trying';

  // Start elapsed timer
  let elapsedSeconds = 0;
  const elapsedTimer = setInterval(() => {
    elapsedSeconds++;
    const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const s = String(elapsedSeconds % 60).padStart(2, '0');
    progressElapsed.textContent = `${m}:${s}`;
  }, 1000);

  const formData = new FormData();
  formData.append('image', state.imageFile);
  if (promptInput.value.trim()) {
    formData.append('prompt', promptInput.value.trim());
  }

  try {
    const resp = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Video oluşturma başarısız');
    }

    const { jobId } = await resp.json();
    state.jobId = jobId;

    await pollJob(jobId);

  } catch (err) {
    clearInterval(elapsedTimer);
    progressSection.classList.add('hidden');
    hfChain.className = 'chain-item failed';
    showError(err.message);
    resetGenerateBtn();
  }
});

async function pollJob(jobId) {
  const maxAttempts = 300;
  state.polling = true;

  for (let i = 0; i < maxAttempts && state.polling; i++) {
    try {
      const resp = await fetch(`${API_BASE}/api/status/${jobId}`);
      const job = await resp.json();

      progressFill.style.width = `${job.progress || 0}%`;

      // Progress messages
      if (job.progress < 10) {
        progressText.textContent = 'Görsel yükleniyor...';
        progressProvider.textContent = 'Stable Video Diffusion hazırlanıyor...';
      } else if (job.progress < 20) {
        progressText.textContent = 'HF API\'ye bağlanılıyor...';
        progressProvider.textContent = 'Hugging Face Inference API çalışıyor...';
      } else if (job.progress < 50) {
        progressText.textContent = 'Video oluşturuluyor (kare kare)...';
        progressProvider.textContent = '🎬 Stable Video Diffusion işliyor...';
      } else if (job.progress < 80) {
        progressText.textContent = 'Neredeyse bitti...';
      } else {
        progressText.textContent = 'Son rötuşlar yapılıyor...';
      }

      if (job.status === 'completed') {
        clearInterval(elapsedTimer);
        progressText.textContent = '✅ Tamamlandı!';
        progressFill.style.width = '100%';
        await new Promise(r => setTimeout(r, 500));
        hfChain.className = 'chain-item success';
        await showResult(job);
        state.polling = false;
        return;
      }

      if (job.status === 'failed') {
        clearInterval(elapsedTimer);
        hfChain.className = 'chain-item failed';
        // Try fallback chain
        fallbackChain.className = 'chain-item trying';
        throw new Error(job.error || 'Video oluşturma başarısız');
      }

    } catch (err) {
      if (err.message.includes('başarısız') || err.message.includes('Token')) throw err;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  if (state.polling) {
    clearInterval(elapsedTimer);
    progressSection.classList.add('hidden');
    hfChain.className = 'chain-item failed';
    showError('Zaman aşımı. Lütfen tekrar deneyin.');
    resetGenerateBtn();
  }
}

async function showResult(job) {
  progressSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  resultSource.src = state.imageDataUrl;

  const videoUrl = job.resultUrl;
  if (videoUrl) {
    const fullUrl = videoUrl.startsWith('http') ? videoUrl : `${API_BASE}${videoUrl}`;
    resultVideo.src = fullUrl;
    resultVideo.load();
  }

  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    link.href = videoUrl.startsWith('http') ? videoUrl : `${API_BASE}${videoUrl}`;
    link.download = 'ai-video.mp4';
    link.click();
  };

  resetGenerateBtn();
}

// === Try Again ===
tryAgainBtn.addEventListener('click', () => {
  resultSection.classList.add('hidden');
  resultVideo.src = '';
  resultVideo.load();
  resultSource.src = '';
  imageRemove.click();
  hfChain.className = 'chain-item active';
  fallbackChain.className = 'chain-item';
});

// === Error ===
function showError(message) {
  // Remove existing errors
  errorContainer.querySelectorAll('.error-message').forEach(el => el.remove());

  const el = document.createElement('div');
  el.className = 'error-message';
  el.innerHTML = `⚠️ ${message}`;
  errorContainer.appendChild(el);

  // Auto-dismiss
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 20000);
}

function hideError() {
  errorContainer.querySelectorAll('.error-message').forEach(el => el.remove());
}

function resetGenerateBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('.btn-text').textContent = 'Video Oluştur';
  if (state.imageFile) {
    generateHint.textContent = '✅ Video oluşturmak için tıklayın';
  }
}

// === Tabs ===
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));

    tab.classList.add('active');
    const targetId = 'tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    const target = document.getElementById(targetId);
    if (target) target.classList.add('active');
  });
});

// === FAQ Accordion ===
$$('.faq-question').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.closest('.faq-item');
    item.classList.toggle('open');
  });
});

// === Keyboard Shortcut ===
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    generateBtn.click();
  }
});

// === Init ===
init();
console.log('🎬 Image to Video - Hazır!');
