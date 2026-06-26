const state = {
  modelFile: null,
  modelDataUrl: null,
  clothFile: null,
  clothDataUrl: null,
  jobId: null,
  polling: false,
  bflEnabled: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const modelDropZone = $('#modelDropZone');
const modelInput = $('#modelInput');
const modelPreview = $('#modelPreview');
const modelPlaceholder = $('#modelPlaceholder');
const modelPreviewImg = $('#modelPreviewImg');
const modelRemove = $('#modelRemove');
const modelSample = $('#modelSample');

const clothDropZone = $('#clothDropZone');
const clothInput = $('#clothInput');
const clothPreview = $('#clothPreview');
const clothPlaceholder = $('#clothPlaceholder');
const clothPreviewImg = $('#clothPreviewImg');
const clothRemove = $('#clothRemove');
const clothSample = $('#clothSample');

const generateBtn = $('#generateBtn');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const settingsClose = $('#settingsClose');
const apiKeyInput = $('#apiKeyInput');
const apiSaveBtn = $('#apiSaveBtn');
const apiStatus = $('#apiStatus');
const statusDot = $('#statusDot');
const connectionStatus = $('#connectionStatus');

const progressSection = $('#progressSection');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const progressProvider = $('#progressProvider');

const resultSection = $('#resultSection');
const resultModel = $('#resultModel');
const resultCloth = $('#resultCloth');
const resultImage = $('#resultImage');
const downloadBtn = $('#downloadBtn');
const tryAgainBtn = $('#tryAgainBtn');

const themeToggle = $('#themeToggle');
const themeIcon = $('#themeIcon');

const API_BASE = '';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeIcon.textContent = theme === 'dark' ? 'dark' : 'light';
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

async function init() {
  await checkStatus();
  await loadSamples();
}

async function checkStatus() {
  try {
    const resp = await fetch(API_BASE + '/api/status');
    const data = await resp.json();
    state.bflEnabled = data.bflEnabled;
    statusDot.className = 'status-dot' + (data.bflEnabled ? ' active' : '');
    connectionStatus.title = data.bflEnabled ? 'BFL API Hazir' : 'API Key gerekli';
  } catch {
    statusDot.className = 'status-dot';
    connectionStatus.title = 'Sunucu baglantisi yok';
  }
}

async function loadSamples() {
  try {
    const resp = await fetch(API_BASE + '/api/samples');
    const data = await resp.json();
    SAMPLE_MODELS = data.models || SAMPLE_MODELS;
    SAMPLE_CLOTHES = data.clothes || SAMPLE_CLOTHES;
  } catch {}
}

let SAMPLE_MODELS = [];
let SAMPLE_CLOTHES = [];
let modelSampleIndex = 0;
let clothSampleIndex = 0;

function createUploadHandler(dropZone, input, preview, placeholder, previewImg, removeBtn, stateKey, dataUrlKey) {
  const maxSize = 20 * 1024 * 1024;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  function handleFile(file) {
    if (!file) return;
    if (!allowedTypes.includes(file.type)) {
      alert('Desteklenmeyen dosya turu. Izin verilenler: jpg, png, webp');
      return;
    }
    if (file.size > maxSize) {
      alert('Dosya cok buyuk. Maksimum 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      placeholder.classList.add('hidden');
      preview.classList.remove('hidden');
      state[stateKey] = file;
      state[dataUrlKey] = e.target.result;
      updateGenerateBtn();
    };
    reader.readAsDataURL(file);
  }

  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('.remove-btn, .sample-btn')) return;
    input.click();
  });

  input.addEventListener('change', () => {
    if (input.files.length > 0) handleFile(input.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });

  function clear() {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    previewImg.src = '';
    input.value = '';
    state[stateKey] = null;
    state[dataUrlKey] = null;
    updateGenerateBtn();
  }

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clear();
  });

  return { handleFile, clear };
}

const modelUpload = createUploadHandler(
  modelDropZone, modelInput, modelPreview, modelPlaceholder, modelPreviewImg, modelRemove,
  'modelFile', 'modelDataUrl'
);

const clothUpload = createUploadHandler(
  clothDropZone, clothInput, clothPreview, clothPlaceholder, clothPreviewImg, clothRemove,
  'clothFile', 'clothDataUrl'
);

modelSample.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (SAMPLE_MODELS.length === 0) return;
  const url = SAMPLE_MODELS[modelSampleIndex % SAMPLE_MODELS.length].url;
  modelSampleIndex++;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const ext = url.split('.').pop() || 'jpg';
    const file = new File([blob], 'sample.' + ext, { type: blob.type || 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    modelInput.files = dt.files;
    modelUpload.handleFile(file);
  } catch (err) {
    console.error('Ornek model yuklenemedi:', err);
  }
});

clothSample.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (SAMPLE_CLOTHES.length === 0) return;
  const url = SAMPLE_CLOTHES[clothSampleIndex % SAMPLE_CLOTHES.length].url;
  clothSampleIndex++;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const ext = url.split('.').pop() || 'jpg';
    const file = new File([blob], 'sample.' + ext, { type: blob.type || 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    clothInput.files = dt.files;
    clothUpload.handleFile(file);
  } catch (err) {
    console.error('Ornek kiyafet yuklenemedi:', err);
  }
});

function updateGenerateBtn() {
  const ready = state.modelFile && state.clothFile;
  generateBtn.disabled = !ready;
  generateBtn.classList.toggle('ready', ready);
}

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  apiKeyInput.value = localStorage.getItem('bfl_api_key') || '';
  apiStatus.textContent = '';
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
    apiStatus.textContent = 'Lutfen bir API Key girin';
    apiStatus.className = 'api-status error';
    return;
  }

  apiSaveBtn.disabled = true;
  apiSaveBtn.textContent = 'Kaydediliyor...';

  try {
    const resp = await fetch(API_BASE + '/api/set-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await resp.json();

    if (data.success) {
      localStorage.setItem('bfl_api_key', key);
      state.bflEnabled = true;
      apiStatus.textContent = 'API Key kaydedildi!';
      apiStatus.className = 'api-status success';
      statusDot.className = 'status-dot active';
      connectionStatus.title = 'BFL API Hazir';
    } else {
      apiStatus.textContent = 'API Key gecersiz';
      apiStatus.className = 'api-status error';
    }
  } catch (err) {
    apiStatus.textContent = 'Sunucuya baglanilamadi';
    apiStatus.className = 'api-status error';
  } finally {
    apiSaveBtn.disabled = false;
    apiSaveBtn.textContent = 'Kaydet';
  }
});

generateBtn.addEventListener('click', async () => {
  if (!state.modelFile || !state.clothFile) return;

  hideError();
  resultSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Siraya alindi...';
  progressProvider.textContent = 'FLUX VTO hazirlaniyor...';
  generateBtn.disabled = true;
  generateBtn.querySelector('.btn-text').textContent = 'Olusturuluyor...';

  const formData = new FormData();
  formData.append('modelImage', state.modelFile);
  formData.append('clothImage', state.clothFile);

  try {
    const resp = await fetch(API_BASE + '/api/generate', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Gorsel olusturma basarisiz');
    }

    const data = await resp.json();
    state.jobId = data.jobId;
    await pollJob(data.jobId);

  } catch (err) {
    progressSection.classList.add('hidden');
    showError(err.message);
    resetGenerateBtn();
  }
});

async function pollJob(jobId) {
  const maxAttempts = 600;
  state.polling = true;

  for (let i = 0; i < maxAttempts && state.polling; i++) {
    try {
      const resp = await fetch(API_BASE + '/api/status/' + jobId);
      const job = await resp.json();

      progressFill.style.width = (job.progress || 0) + '%';

      if (job.progress < 30) {
        progressText.textContent = 'Gorseller yukleniyor...';
      } else if (job.progress < 50) {
        progressText.textContent = 'FLUX VTO calisiyor...';
      } else if (job.progress < 90) {
        progressText.textContent = 'Sonuc hazirlaniyor...';
      } else {
        progressText.textContent = 'Tamamlaniyor...';
      }

      if (job.status === 'completed') {
        progressText.textContent = 'Tamamlandi!';
        await showResult(job);
        state.polling = false;
        return;
      }

      if (job.status === 'failed') {
        throw new Error(job.error || 'Gorsel olusturma basarisiz');
      }

    } catch (err) {
      if (err.message.indexOf('basarisiz') >= 0 || err.message.indexOf('API Key') >= 0) throw err;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  if (state.polling) {
    showError('Zaman asimi. Lutfen tekrar deneyin.');
    resetGenerateBtn();
  }
}

async function showResult(job) {
  progressSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  resultModel.src = state.modelDataUrl;
  resultCloth.src = state.clothDataUrl;

  const imageUrl = job.resultUrl;
  if (imageUrl) {
    resultImage.src = imageUrl.indexOf('http') === 0 ? imageUrl : API_BASE + imageUrl;
  }

  downloadBtn.onclick = function() {
    const link = document.createElement('a');
    link.href = imageUrl.indexOf('http') === 0 ? imageUrl : API_BASE + imageUrl;
    link.download = 'cloth-swap-result.png';
    link.click();
  };

  resetGenerateBtn();
}

tryAgainBtn.addEventListener('click', () => {
  resultSection.classList.add('hidden');
  resultImage.src = '';
  resultModel.src = '';
  resultCloth.src = '';
  modelUpload.clear();
  clothUpload.clear();
});

function showError(message) {
  const existing = document.querySelector('.error-message');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'error-message';
  el.textContent = message;

  const section = document.querySelector('.generate-section');
  section.parentNode.insertBefore(el, section.nextSibling);
  setTimeout(function() { el.remove(); }, 15000);
}

function hideError() {
  const existing = document.querySelector('.error-message');
  if (existing) existing.remove();
}

function resetGenerateBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('.btn-text').textContent = 'Kiyafet Degistir';
}

$$('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    $$('.tab').forEach(function(t) { t.classList.remove('active'); });
    $$('.tab-content').forEach(function(tc) { tc.classList.remove('active'); });
    tab.classList.add('active');
    var targetId = 'tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    var target = document.getElementById(targetId);
    if (target) target.classList.add('active');
  });
});

init();
