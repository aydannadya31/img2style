const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE = 'https://api.muapi.ai/api/v1';

class MuapiBridge {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.headers = { 'x-api-key': apiKey };
    this.models = [
      'happy-horse-1-image-to-video-1080p',
      'happy-horse-1-image-to-video-720p',
      'happy-horse-1.1-image-to-video-720p'
    ];
    this.pollInterval = 3000;
    this.maxPolls = 120;
  }

  async generate(jobId, imagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;
    try {
      onProgress?.(5);
      const imageUrl = await this._uploadImage(imagePath);
      onProgress?.(20);

      let lastError = null;
      for (const model of this.models) {
        try {
          onProgress?.(25);
          console.log(`[Muapi] Trying model: ${model}`);
          const requestId = await this._submitGeneration(model, imageUrl);
          onProgress?.(40);

          const result = await this._pollResult(requestId, model, onProgress);
          if (result && result.output?.video) {
            await this._downloadAndSave(result.output.video, jobId, onProgress, onComplete);
            return;
          }
        } catch (err) {
          lastError = err;
          console.log(`[Muapi] Model ${model} failed: ${err.message}`);
          onProgress?.(25);
        }
      }

      throw lastError || new Error('Muapi: t├╝m modeller ba┼şar─▒s─▒z');
    } catch (error) {
      console.error(`[Muapi] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  async _uploadImage(imagePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    const resp = await axios.post(`${API_BASE}/upload_file`, form, {
      headers: { ...this.headers, ...form.getHeaders() },
      timeout: 30000
    });
    return resp.data?.url || resp.data?.data?.url;
  }

  async _submitGeneration(model, imageUrl) {
    const resp = await axios.post(`${API_BASE}/${model}`, {
      image_url: imageUrl,
      prompt: '',
      num_frames: 49
    }, { headers: this.headers, timeout: 30000 });
    return resp.data?.request_id || resp.data?.data?.request_id || resp.data?.id;
  }

  async _pollResult(requestId, model, onProgress) {
    for (let i = 0; i < this.maxPolls; i++) {
      await new Promise(r => setTimeout(r, this.pollInterval));
      try {
        const resp = await axios.get(`${API_BASE}/predictions/${requestId}/result`, {
          headers: this.headers,
          timeout: 10000
        });
        const status = resp.data?.status;
        if (status === 'completed' || status === 'succeeded') {
          onProgress?.(80);
          return resp.data;
        }
        if (status === 'failed') throw new Error(`Muapi: ${model} ba┼şar─▒s─▒z`);
        onProgress?.(30 + Math.min(i * 5, 40));
      } catch (e) {
        if (e.message.includes('ba┼şar─▒s─▒z')) throw e;
      }
    }
    throw new Error('Muapi: zaman a┼ş─▒m─▒');
  }

  async _downloadAndSave(videoUrl, jobId, onProgress, onComplete) {
    onProgress?.(85);
    const resp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    const outputPath = path.join(resultsDir, `${jobId}.mp4`);
    fs.writeFileSync(outputPath, resp.data);
    onProgress?.(100);
    onComplete?.(outputPath);
  }
}

module.exports = { MuapiBridge };
