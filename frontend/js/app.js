const state = {
  imageFile: null,
  imageDataUrl: null,
  jobId: null,
  polling: false,
  providers: { hf: false, agnes: false, muapi: false }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const uploadArea = $('#uploadArea');
const imageInput = $('#imageInput');
const imagePreview = $('#imagePreview');
const uploadPlaceholder = $('#uploadPlaceholder');
const changeImageBtn = $('#changeImageBtn');
const generateBtn = $('#generateBtn');
const generateHint = $('#generateHint');
const resultVideo = $('#resultVideo');
const videoContainer = $('#videoContainer');
const outputPlaceholder = $('#outputPlaceholder');
const loadingSpinner = $('#loadingSpinner');
const loadingText = $('#loadingText');
const progressFill = $('#progressFill');
const progressText = $('#progressText');
const uploadProgress = $('#uploadProgress');
const downloadBtn = $('#downloadBtn');
const promptInput = $('#promptInput');
const durationBtns = $$('.duration-btn');
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const modalClose = $('#modalClose');
const saveKeysBtn = $('#saveKeysBtn');
const themeBtn = $('#themeBtn');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const toast = $('#toast');
const providerBarInfo = $('#providerBarInfo');

function providerDot(name) {
  const el = document.getElementById(`pdot-${name}`);
  if (el) return el;
  const dummy = { className: '' };
  dummy.classList = { add() {}, remove() {} };
  return dummy;
}

function providerStatus(name) {
  return document.getElementById(`pstatus-${name}`);
}

function providerInput(name) {
  return document.getElementById(`key-${name}`);
}

uploadArea.addEventListener('click', (e) => {
  if (e.target.closest('.change-image-btn')) return;
  imageInput.click();
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImageFile(file);
});

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageFile(file);
});

function handleImageFile(file) {
  state.imageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.imageDataUrl = e.target.result;
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    changeImageBtn.style.display = 'flex';
    updateGenerateBtn();
  };
  reader.readAsDataURL(file);
}

changeImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  imageInput.click();
});

durationBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    durationBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

generateBtn.addEventListener('click', generateVideo);

async function generateVideo() {
  if (!state.imageFile || generateBtn.disabled) return;

  const formData = new FormData();
  formData.append('image', state.imageFile);
  formData.append('prompt', promptInput.value.trim());
  const activeDuration = document.querySelector('.duration-btn.active');
  formData.append('duration', activeDuration ? activeDuration.dataset.duration : '10');

  generateBtn.disabled = true;
  generateBtn.querySelector('span').textContent = 'Gönderiliyor...';
  outputPlaceholder.style.display = 'none';
  videoContainer.style.display = 'none';
  loadingSpinner.style.display = 'flex';
  loadingText.textContent = 'Video oluşturuluyor...';
  uploadProgress.style.display = 'none';

  try {
    const res = await fetch('/api/generate', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sunucu hatası');
    state.jobId = data.jobId;
    startPolling();
  } catch (err) {
    showError(err.message);
    resetGenerateBtn();
    loadingSpinner.style.display = 'none';
    outputPlaceholder.style.display = 'flex';
  }
}

function startPolling() {
  state.polling = true;
  pollStatus();
}

async function pollStatus() {
  if (!state.polling) return;
  try {
    const res = await fetch(`/api/status/${state.jobId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Durum alınamadı');

    // Show active provider
    if (data.provider) {
      const label = data.providerLabel || data.provider;
      loadingText.textContent = `[${label}] Video oluşturuluyor... ${data.progress || 0}%`;
      highlightChainProvider(data.provider, 'trying');
    }

    if (data.status === 'completed') {
      state.polling = false;
      loadingSpinner.style.display = 'none';
      videoContainer.style.display = 'block';
      resultVideo.src = data.resultUrl;
      resultVideo.load();
      downloadBtn.href = data.resultUrl;
      highlightChainProvider(data.provider, 'success');
      showToast(`✅ ${data.providerLabel || data.provider} ile oluşturuldu!`, 'success');
      resetGenerateBtn();
    } else if (data.status === 'failed') {
      state.polling = false;
      showError(data.error || 'Video oluşturulamadı');
      loadingSpinner.style.display = 'none';
      outputPlaceholder.style.display = 'flex';
      resetGenerateBtn();
    } else {
      loadingText.textContent = `Video oluşturuluyor... ${data.progress || 0}%`;
      setTimeout(pollStatus, 2000);
    }
  } catch (err) {
    if (state.polling) {
      setTimeout(pollStatus, 2000);
    }
  }
}

function highlightChainProvider(name, mode) {
  const items = $$('.pchain-item');
  items.forEach(el => {
    el.classList.remove('trying', 'success', 'failed');
    if (el.dataset.provider === name) {
      el.classList.add(mode);
    }
  });
}

function resetChain() {
  $$('.pchain-item').forEach(el => el.classList.remove('trying', 'success', 'failed'));
}

function resetGenerateBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('span').textContent = 'Video Oluştur';
  uploadProgress.style.display = 'none';
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const anyProvider = Object.values(state.providers).some(v => v);
  const canGenerate = state.imageFile && anyProvider;
  generateBtn.disabled = !canGenerate;
  generateHint.textContent = !state.imageFile ? 'Önce bir görsel yükleyin' :
    !anyProvider ? 'Ayarlardan API key girin' : 'Hazır';
}

settingsBtn.addEventListener('click', () => openSettings());
modalClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

function openSettings() {
  settingsModal.classList.add('active');
  ['hf', 'agnes', 'muapi'].forEach(name => {
    const input = providerInput(name);
    if (input) input.value = '';
  });
  const first = providerInput('hf');
  if (first) first.focus();
}

function closeSettings() {
  settingsModal.classList.remove('active');
}

saveKeysBtn.addEventListener('click', saveAllKeys);

async function saveAllKeys() {
  saveKeysBtn.disabled = true;
  saveKeysBtn.textContent = 'Kaydediliyor...';

  const providers = ['hf', 'agnes', 'muapi'];
  let success = 0;

  for (const name of providers) {
    const input = providerInput(name);
    if (!input) continue;
    const key = input.value.trim();
    if (!key) continue;

    try {
      const res = await fetch('/api/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: name, apiKey: key })
      });
      const data = await res.json();
      if (data.enabled) {
        state.providers[name] = true;
        const ps = providerStatus(name);
        if (ps) ps.textContent = '✅';
        success++;
      }
    } catch (err) {
      const ps = providerStatus(name);
      if (ps) ps.textContent = '❌';
    }
  }

  await checkProviderStatus();
  updateGenerateBtn();

  saveKeysBtn.disabled = false;
  saveKeysBtn.textContent = 'Tüm Key\'leri Kaydet';
  showToast(`${success} key kaydedildi`, 'success');
  if (success > 0) closeSettings();
}

themeBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

async function checkProviderStatus() {
  try {
    const res = await fetch('/api/providers');
    const data = await res.json();

    let activeCount = 0;
    data.providers.forEach(p => {
      const enabled = p.enabled;
      state.providers[p.name] = enabled;
      if (enabled) activeCount++;

      const dot = providerDot(p.name);
      dot.className = `pchain-dot ${enabled ? 'active' : ''}`;

      const ps = providerStatus(p.name);
      if (ps) ps.textContent = enabled ? '✅' : '⏳';

      const input = providerInput(p.name);
      if (input) input.placeholder = enabled ? '✓ ayarlı' : (input.dataset.placeholder || input.placeholder);
    });

    statusDot.className = `status-dot ${activeCount > 0 ? 'active' : ''}`;
    statusText.textContent = activeCount > 0 ? `${activeCount}/3 aktif` : 'Key gerekli';

    const firstActive = data.providers.find(p => p.enabled);
    providerBarInfo.textContent = firstActive
      ? `✅ Öncelik: ${firstActive.label}`
      : '⚙️ Ayarlardan API key girin';

    updateGenerateBtn();
  } catch (err) {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Bağlantı yok';
    providerBarInfo.textContent = '⚠️ Sunucuya bağlanılamadı';
  }
}

function showToast(message, type = 'error') {
  toast.textContent = message;
  toast.className = `toast ${type} active`;
  setTimeout(() => toast.classList.remove('active'), 4000);
}

function showError(message) {
  showToast(message, 'error');
}

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

checkProviderStatus();
setInterval(checkProviderStatus, 30000);
