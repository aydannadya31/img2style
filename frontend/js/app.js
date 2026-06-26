// === State ===
const state = {
  imageFile: null,
  imageDataUrl: null,
  jobId: null,
  polling: false,
  hfEnabled: false
};

// === DOM Helpers ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// === DOM Elements ===
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
const settingsBtn = $('#settingsBtn');
const settingsModal = $('#settingsModal');
const modalClose = $('#modalClose');
const hfTokenInput = $('#hfTokenInput');
const saveKeyBtn = $('#saveKeyBtn');
const tokenStatus = $('#tokenStatus');
const tokenStatusText = $('#tokenStatusText');
const themeBtn = $('#themeBtn');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const toast = $('#toast');

// === Image Upload ===
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

// === Video Generation ===
generateBtn.addEventListener('click', generateVideo);

async function generateVideo() {
  if (!state.imageFile || generateBtn.disabled) return;

  const formData = new FormData();
  formData.append('image', state.imageFile);

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

    if (data.status === 'completed') {
      state.polling = false;
      loadingSpinner.style.display = 'none';
      videoContainer.style.display = 'block';
      resultVideo.src = data.resultUrl;
      resultVideo.load();
      downloadBtn.href = data.resultUrl;
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
    state.polling = false;
    showError('Bağlantı hatası: ' + err.message);
    loadingSpinner.style.display = 'none';
    outputPlaceholder.style.display = 'flex';
    resetGenerateBtn();
  }
}

function resetGenerateBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('span').textContent = 'Video Oluştur';
  uploadProgress.style.display = 'none';
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const canGenerate = state.imageFile && state.hfEnabled;
  generateBtn.disabled = !canGenerate;
  generateHint.textContent = !state.imageFile ? 'Önce bir görsel yükleyin' :
    !state.hfEnabled ? 'Ayarlardan HF Token girin' : 'Hazır';
}

// === Settings / Token ===
settingsBtn.addEventListener('click', () => openSettings());
modalClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

function openSettings() {
  settingsModal.classList.add('active');
  hfTokenInput.value = '';
  hfTokenInput.focus();
}

function closeSettings() {
  settingsModal.classList.remove('active');
}

saveKeyBtn.addEventListener('click', saveToken);
hfTokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveToken();
});

async function saveToken() {
  const token = hfTokenInput.value.trim();
  if (!token) {
    showToast('Lütfen bir token girin', 'error');
    return;
  }
  saveKeyBtn.disabled = true;
  saveKeyBtn.textContent = 'Kaydediliyor...';
  try {
    const res = await fetch('/api/set-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    state.hfEnabled = data.enabled;
    updateTokenStatus();
    updateGenerateBtn();
    showToast('Token kaydedildi', 'success');
    hfTokenInput.value = '';
    closeSettings();
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = 'Kaydet';
  }
}

function updateTokenStatus() {
  const indicator = tokenStatus.querySelector('.status-indicator');
  if (state.hfEnabled) {
    indicator.className = 'status-indicator active';
    tokenStatusText.textContent = 'HF API Hazır';
  } else {
    indicator.className = 'status-indicator inactive';
    tokenStatusText.textContent = 'Token ayarlanmamış';
  }
}

// === Theme Toggle ===
themeBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  updateThemeIcons(!isDark);
}

function updateThemeIcons(dark) {
  document.querySelector('.sun-icon').style.display = dark ? 'none' : 'block';
  document.querySelector('.moon-icon').style.display = dark ? 'block' : 'none';
}

// === Server Status ===
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.hfEnabled = data.hfEnabled;
    statusDot.className = `status-dot ${data.hfEnabled ? 'active' : ''}`;
    statusText.textContent = data.hfEnabled ? 'HF API Hazır' : 'HF Token gerekli';
    updateTokenStatus();
    updateGenerateBtn();
  } catch (err) {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Sunucuya bağlanılamadı';
  }
}

// === Toast ===
function showToast(message, type = 'error') {
  toast.textContent = message;
  toast.className = `toast ${type} active`;
  setTimeout(() => toast.classList.remove('active'), 4000);
}

function showError(message) {
  showToast(message, 'error');
}

// === Init ===
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcons(savedTheme === 'dark');

checkServerStatus();

// Periodically check server status
setInterval(checkServerStatus, 30000);
