const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://apihub.agnes-ai.com/v1';

class AgnesBridge {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    this.pollInterval = 3000;
    this.maxPolls = 100;
  }

  async generate(jobId, imagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;
    try {
      onProgress?.(5);

      const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
      const ext = path.extname(imagePath).slice(1) || 'jpg';
      const dataUri = `data:image/${ext};base64,${imageBase64}`;
      onProgress?.(15);

      const resp = await axios.post(`${API_BASE}/videos`, {
        model: 'agnes-video-v2.0',
        image_url: dataUri,
        prompt: '',
        height: 768,
        width: 1152,
        num_frames: 49,
        frame_rate: 16
      }, { headers: this.headers, timeout: 30000 });

      onProgress?.(30);

      const videoId = resp.data?.id || resp.data?.data?.id;
      if (!videoId) {
        throw new Error('Agnes: video ID al─▒namad─▒: ' + JSON.stringify(resp.data));
      }

      const result = await this._pollVideo(videoId, onProgress);
      if (!result || !result.video_url) {
        throw new Error('Agnes: video URL al─▒namad─▒');
      }

      await this._downloadAndSave(result.video_url, jobId, onProgress, onComplete);
    } catch (error) {
      console.error(`[Agnes] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  async _pollVideo(videoId, onProgress) {
    const pollUrl = `https://apihub.agnes-ai.com/v1/agnesapi?video_id=${videoId}`;
    for (let i = 0; i < this.maxPolls; i++) {
      await new Promise(r => setTimeout(r, this.pollInterval));
      try {
        const resp = await axios.get(pollUrl, { headers: this.headers, timeout: 10000 });
        const status = resp.data?.status;
        if (status === 'completed' || status === 'succeeded') {
          onProgress?.(80);
          return resp.data;
        }
        if (status === 'failed') {
          throw new Error('Agnes: video ├╝retimi ba┼şar─▒s─▒z');
        }
        onProgress?.(30 + Math.min(i * 10, 40));
      } catch (e) {
        if (e.message.includes('ba┼şar─▒s─▒z')) throw e;
      }
    }
    throw new Error('Agnes: zaman a┼ş─▒m─▒');
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

module.exports = { AgnesBridge };
