const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================
// Hugging Face Inference API Provider
// Model: stabilityai/stable-video-diffusion-img2vid
// Docs:  https://huggingface.co/stabilityai/stable-video-diffusion-img2vid
// Free tier: ~30 req/min with valid HF token
// ============================================================

const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const MODEL = 'stabilityai/stable-video-diffusion-img2vid';

class HFProvider {
  constructor(apiToken) {
    this.apiToken = apiToken;
    this.baseUrl = `${HF_API_BASE}/${MODEL}`;
  }

  /**
   * Generate video from an image using Stable Video Diffusion
   * @param {string} jobId - Unique job ID
   * @param {string} imagePath - Path to the source image
   * @param {object} callbacks - { onProgress, onComplete, onError }
   */
  async generate(jobId, imagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
      onProgress?.(5);

      // 1. Read the source image
      const imageBuffer = fs.readFileSync(imagePath);
      onProgress?.(10);

      // 2. Call HF Inference API
      const videoBuffer = await this._callHFAPI(imageBuffer, onProgress);

      // 3. Save the result video
      onProgress?.(90);
      const resultPath = this._saveResult(videoBuffer, jobId);

      onProgress?.(100);
      onComplete?.(resultPath);

    } catch (error) {
      console.error(`[HF] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Call the HF Inference API with the image.
   * Handles model loading (503) with automatic retry.
   */
  async _callHFAPI(imageBuffer, onProgress, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        onProgress?.(15 + attempt * 5);

        const response = await axios.post(this.baseUrl, imageBuffer, {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/octet-stream',
          },
          responseType: 'arraybuffer',
          timeout: 180000, // 3 minutes for SVD
          validateStatus: (status) => {
            // Accept 200 (success) and 503 (model loading)
            return status === 200 || status === 503;
          }
        });

        // Model is still loading — wait and retry
        if (response.status === 503) {
          const data = this._tryParseError(response.data);
          const waitTime = (data?.estimated_time || 20) * 1000;
          console.log(`[HF] Model loading, waiting ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
          onProgress?.(20);
          await new Promise(r => setTimeout(r, Math.min(waitTime, 60000)));
          continue;
        }

        // Success — return raw video bytes
        return response.data;

      } catch (error) {
        if (error.code === 'ECONNABORTED' && attempt < retries) {
          console.log(`[HF] Timeout, retrying (${attempt + 1}/${retries})...`);
          continue;
        }
        throw error;
      }
    }

    throw new Error('HF API timed out after retries');
  }

  /**
   * Save the video buffer to the results directory
   */
  _saveResult(videoBuffer, jobId) {
    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const outputPath = path.join(resultsDir, `${jobId}.mp4`);
    fs.writeFileSync(outputPath, videoBuffer);
    console.log(`[HF] Result saved to ${outputPath} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
    return outputPath;
  }

  /**
   * Try to parse error response from HF API
   */
  _tryParseError(buffer) {
    try {
      return JSON.parse(buffer.toString('utf8'));
    } catch {
      return null;
    }
  }
}

module.exports = { HFProvider };
