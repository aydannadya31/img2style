const state = {
  imageFile: null,
  jobId: null,
  polling: false,
  currentProvider: null,
  providers: { hf: false, agnes: false, muapi: false }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs
const imageUpload = $('#imageUpload');
const imageInput = $('#imageInput');
const imagePreview = $('#imagePreview');
const imagePlaceholder = $('#imagePlaceholder');
const changeImageBtn = $('#changeImageBtn');
const generateBtn = $('#generateBtn');
const generateHint = $('#generateHint');
const progressSection = $('#progressSection');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const providerIndicator = $('#providerIndicator');
const currentProviderLabel = $('#currentProviderLabel');
const resultSection = $('#resultSection');
const resultVideo = $('#resultVideo');
const resultFallbackImg = $('#resultFallbackImg');
const resultError = $('#resultError');
const downloadBtn = $('#downloadBtn');
const toast = $('#toast');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const modalClose = $('#modalClose');
const hfKey = $('#hfKey');
const agnesKey = $('#agnesKey');
const muapiKey = $('#muapiKey');
const saveKeysBtn = $('#saveKeysBtn');

// Helpers
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => toast.className = 'toast', 3000);
}

function setProviderStep(name, status) {
  const step = document.querySelector(`.provider-step[data-provider="${name}"]`);
  if (!step) return;
  step.className = 'provider-step ' + status;
}

function resetProviderBar() {
  $$('.provider-step').forEach(el => el.className = 'provider-step');
}

function updateProviderStatus(providerStatus) {
  providerStatus.forEach(p => {
    state.providers[p.name] = p.enabled;
    if (p.enabled) {
      setProviderStep(p.name, 'available');
    }
  });
}

// Status check
async function fetchStatus() {
  try {
    const r = await fetch('/api/providers');
    const d = await r.json();
    if (d.providers) updateProviderStatus(d.providers);
  } catch {}
}

// Image upload
function setupUpload() {
  imageUpload.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    state.imageFile = file;
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.style.display = 'block';
    imagePlaceholder.style.display = 'none';
    changeImageBtn.style.display = 'flex';
    updateGenerateBtn();
  });
  changeImageBtn.addEventListener('click', (e) => { e.stopPropagation(); imageInput.click(); });
  imageUpload.addEventListener('dragover', (e) => { e.preventDefault(); imageUpload.classList.add('drag-over'); });
  imageUpload.addEventListener('dragleave', () => imageUpload.classList.remove('drag-over'));
  imageUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUpload.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    state.imageFile = file;
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.style.display = 'block';
    imagePlaceholder.style.display = 'none';
    changeImageBtn.style.display = 'flex';
    updateGenerateBtn();
  });
}

function updateGenerateBtn() {
  generateBtn.disabled = !state.imageFile;
  generateHint.textContent = state.imageFile ? 'Gorsel hazir' : 'Once bir gorsel yukleyin';
}

// Generate
generateBtn.addEventListener('click', async () => {
  if (!state.imageFile) return;
  const form = new FormData();
  form.append('image', state.imageFile);
  generateBtn.disabled = true;
  generateBtn.querySelector('span').textContent = 'Basliyor...';
  progressSection.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Yukleniyor...';
  resultSection.style.display = 'none';
  resultVideo.style.display = 'none';
  resultFallbackImg.style.display = 'none';
  resultError.style.display = 'none';
  resetProviderBar();
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
      if (d.provider && d.provider !== state.currentProvider) {
        state.currentProvider = d.provider;
        currentProviderLabel.textContent = d.providerLabel || d.provider;
        setProviderStep(d.provider, 'active');
        $$('.provider-step').forEach(el => {
          if (el.dataset.provider !== d.provider) el.classList.add('tried');
        });
      }
      if (d.status === 'completed') {
        state.polling = false;
        state.currentProvider = null;
        setProviderStep(d.provider, 'completed');
        progressText.textContent = 'Tamam!';
        setTimeout(() => {
          progressSection.style.display = 'none';
          showResult(d.resultUrl);
        }, 500);
        return;
      } else if (d.status === 'failed') {
        state.polling = false;
        state.currentProvider = null;
        let errMsg = d.error || 'Hata olustu';
        if (d.errors && d.errors.length > 0) {
          errMsg = d.errors.join(' → ');
        }
        showToast(errMsg, 'error');
        progressText.textContent = 'Hata';
        progressFill.style.width = '0%';
        resetGenerate();
        return;
      }
      progressText.textContent = d.progress > 0 ? 'Isleniyor... %' + Math.round(d.progress) : 'Basliyor...';
    } catch { showToast('Baglanti hatasi', 'error'); state.polling = false; resetGenerate(); return; }
    await new Promise(r => setTimeout(r, 2000));
  }
}

function showResult(url) {
  resultSection.style.display = 'block';
  const isVideo = url.match(/\.(mp4|webm|mov|avi)$/i);
  if (isVideo) {
    resultVideo.src = url;
    resultVideo.style.display = 'block';
    resultFallbackImg.style.display = 'none';
    downloadBtn.href = url;
  } else {
    resultFallbackImg.src = url;
    resultFallbackImg.style.display = 'block';
    resultVideo.style.display = 'none';
    downloadBtn.href = url;
  }
  resetGenerate();
}

function resetGenerate() {
  generateBtn.disabled = false;
  generateBtn.querySelector('span').textContent = 'Video Olustur';
}

// Settings modal
settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
modalClose.addEventListener('click', () => settingsModal.style.display = 'none');
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

saveKeysBtn.addEventListener('click', async () => {
  const keys = [
    { provider: 'hf', value: hfKey.value.trim(), name: 'HF' },
    { provider: 'agnes', value: agnesKey.value.trim(), name: 'Agnes' },
    { provider: 'muapi', value: muapiKey.value.trim(), name: 'Muapi' }
  ];
  let saved = 0;
  for (const k of keys) {
    if (!k.value) continue;
    try {
      const r = await fetch('/api/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: k.provider, apiKey: k.value })
      });
      const d = await r.json();
      if (d.success) saved++;
    } catch {}
  }
  if (saved > 0) {
    showToast(saved + ' API key kaydedildi');
    settingsModal.style.display = 'none';
    hfKey.value = ''; agnesKey.value = ''; muapiKey.value = '';
    fetchStatus();
  } else {
    showToast('Kaydedilecek key girilmedi', 'error');
  }
});

// Init
setupUpload();
fetchStatus();
