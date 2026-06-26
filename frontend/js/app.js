const state = { modelFile: null, clothFile: null, jobId: null, polling: false };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const modelUpload = $('#modelUpload');
const clothUpload = $('#clothUpload');
const modelInput = $('#modelInput');
const clothInput = $('#clothInput');
const modelPreview = $('#modelPreview');
const clothPreview = $('#clothPreview');
const modelPlaceholder = $('#modelPlaceholder');
const clothPlaceholder = $('#clothPlaceholder');
const changeModelBtn = $('#changeModelBtn');
const changeClothBtn = $('#changeClothBtn');
const generateBtn = $('#generateBtn');
const generateHint = $('#generateHint');
const progressSection = $('#progressSection');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const resultSection = $('#resultSection');
const resultModel = $('#resultModel');
const resultCloth = $('#resultCloth');
const resultImage = $('#resultImage');
const downloadBtn = $('#downloadBtn');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const toast = $('#toast');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const modalClose = $('#modalClose');
const apiKeyInput = $('#apiKeyInput');
const saveKeyBtn = $('#saveKeyBtn');
const modelSamples = $('#modelSamples');
const clothSamples = $('#clothSamples');

function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => toast.className = 'toast', 3000);
}

async function fetchStatus() {
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    if (d.bflEnabled) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Bagli';
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = 'API Key Yok';
    }
  } catch { statusDot.className = 'status-dot'; statusText.textContent = 'Sunucu Yok'; }
}

async function fetchSamples() {
  try {
    const r = await fetch('/api/samples');
    const d = await r.json();
    if (d.models) d.models.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'sample-btn';
      btn.textContent = m.name;
      btn.addEventListener('click', () => loadSample(m.url, 'model'));
      modelSamples.appendChild(btn);
    });
    if (d.clothes) d.clothes.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'sample-btn';
      btn.textContent = c.name;
      btn.addEventListener('click', () => loadSample(c.url, 'cloth'));
      clothSamples.appendChild(btn);
    });
  } catch {}
}

async function loadSample(url, type) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const file = new File([blob], type + '.' + blob.type.split('/')[1], { type: blob.type });
    if (type === 'model') {
      state.modelFile = file;
      modelPreview.src = URL.createObjectURL(file);
      modelPreview.style.display = 'block';
      modelPlaceholder.style.display = 'none';
      changeModelBtn.style.display = 'flex';
    } else {
      state.clothFile = file;
      clothPreview.src = URL.createObjectURL(file);
      clothPreview.style.display = 'block';
      clothPlaceholder.style.display = 'none';
      changeClothBtn.style.display = 'flex';
    }
    updateGenerateBtn();
  } catch { showToast('Ornek yuklenemedi', 'error'); }
}

function setupUpload(area, input, preview, placeholder, changeBtn, type) {
  area.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (type === 'model') state.modelFile = file;
    else state.clothFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    changeBtn.style.display = 'flex';
    updateGenerateBtn();
  });
  changeBtn.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (type === 'model') state.modelFile = file;
    else state.clothFile = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    changeBtn.style.display = 'flex';
    updateGenerateBtn();
  });
}

setupUpload(modelUpload, modelInput, modelPreview, modelPlaceholder, changeModelBtn, 'model');
setupUpload(clothUpload, clothInput, clothPreview, clothPlaceholder, changeClothBtn, 'cloth');

function updateGenerateBtn() {
  if (state.modelFile && state.clothFile) {
    generateBtn.disabled = false;
    generateHint.textContent = 'Model ve kiyafet hazir';
  } else {
    generateBtn.disabled = true;
    generateHint.textContent = 'Once model ve kiyafet yukleyin';
  }
}

generateBtn.addEventListener('click', async () => {
  if (!state.modelFile || !state.clothFile) return;
  const form = new FormData();
  form.append('modelImage', state.modelFile);
  form.append('clothImage', state.clothFile);
  generateBtn.disabled = true;
  generateBtn.querySelector('span').textContent = 'Basliyor...';
  progressSection.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Yukleniyor...';
  resultSection.style.display = 'none';
  try {
    const r = await fetch('/api/generate', { method: 'POST', body: form });
    const d = await r.json();
    if (d.error) { showToast(d.error, 'error'); resetGenerate(); return; }
    state.jobId = d.jobId;
    state.polling = true;
    pollJob();
  } catch (e) {
    showToast('Baglanti hatasi', 'error');
    resetGenerate();
  }
});

async function pollJob() {
  while (state.polling) {
    try {
      const r = await fetch('/api/status/' + state.jobId);
      const d = await r.json();
      progressFill.style.width = d.progress + '%';
      if (d.status === 'completed') {
        state.polling = false;
        progressText.textContent = 'Tamam!';
        setTimeout(() => {
          progressSection.style.display = 'none';
          showResult(d.resultUrl);
        }, 500);
        return;
      } else if (d.status === 'failed') {
        state.polling = false;
        showToast(d.error || 'Hata olustu', 'error');
        resetGenerate();
        return;
      }
      progressText.textContent = 'Isleniyor... %' + Math.round(d.progress);
    } catch { showToast('Baglanti hatasi', 'error'); state.polling = false; resetGenerate(); return; }
    await new Promise(r => setTimeout(r, 2000));
  }
}

function showResult(url) {
  resultSection.style.display = 'block';
  resultModel.src = modelPreview.src;
  resultCloth.src = clothPreview.src;
  resultImage.src = url;
  downloadBtn.href = url;
  resetGenerate();
}

function resetGenerate() {
  generateBtn.disabled = false;
  generateBtn.querySelector('span').textContent = 'Olustur';
}

// Settings
settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
modalClose.addEventListener('click', () => settingsModal.style.display = 'none');
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { showToast('API Key girin', 'error'); return; }
  try {
    const r = await fetch('/api/set-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) });
    const d = await r.json();
    if (d.success) { showToast('API Key kaydedildi'); settingsModal.style.display = 'none'; fetchStatus(); }
    else showToast('Hata', 'error');
  } catch { showToast('Baglanti hatasi', 'error'); }
});

fetchStatus();
fetchSamples();
setInterval(fetchStatus, 15000);
