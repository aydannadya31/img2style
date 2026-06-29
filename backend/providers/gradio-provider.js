const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ============================================================
// Gradio Spaces SVD Provider
// Uses: https://huggingface.co/spaces/multimodalart/stable-video-diffusion
// Model: Stability AI Stable Video Diffusion - Img2Vid XT
// API: Gradio v5 REST (/call/{api_name} + SSE stream)
// Cost: FREE (no API key required)
// ============================================================

const SPACE_URL = 'https://multimodalart-stable-video-diffusion.hf.space';
const API_PREFIX = '/gradio_api';
const API_NAME = 'video';
const TIMEFILES_URL = 'https://tmpfiles.org/api/v1/upload';

const DEFAULT_MOTION_BUCKET = 127;
const DEFAULT_FPS = 6;
const POLL_INTERVAL = 3000;
const MAX_POLLS = 120; // 6 minutes max

class GradioProvider {
  constructor(options = {}) {
    this.spaceUrl = options.spaceUrl || SPACE_URL;
    this.baseCallUrl = `${this.spaceUrl}${API_PREFIX}/call/${API_NAME}`;
  }

  /**
   * Generate video from an image using Gradio SVD Space
   * @param {string} jobId - Unique job ID
   * @param {string} imagePath - Path to the source image
   * @param {object} callbacks - { onProgress, onComplete, onError }
   */
  async generate(jobId, imagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
      onProgress?.(5);

      // 1. Upload image to tmpfiles.org for a public URL
      const imageUrl = await this._uploadImage(imagePath);
      onProgress?.(20);

      // 2. Call Gradio API to start generation
      const eventId = await this._startGeneration(imageUrl);
      onProgress?.(30);

      // 3. Poll SSE stream until complete
      const resultData = await this._pollResult(eventId, onProgress);

      // 4. Extract video URL from result
      const videoUrl = resultData?.video?.url;
      if (!videoUrl) {
        throw new Error('Gradio: video URL bulunamadi');
      }

      // 5. Download and save
      onProgress?.(85);
      await this._downloadAndSave(videoUrl, jobId, onProgress, onComplete);

    } catch (error) {
      console.error(`[Gradio] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Upload image to tmpfiles.org and return public URL
   */
  async _uploadImage(imagePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));

    const resp = await axios.post(TIMEFILES_URL, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    // tmpfiles returns: { data: { url: "https://tmpfiles.org/..." } }
    const rawUrl = resp.data?.data?.url;
    if (!rawUrl) throw new Error('Gradio: tmpfiles upload failed');

    // Convert tmpfiles.org/dl/... to direct download URL
    const directUrl = rawUrl.replace('/dl/', '/');
    return directUrl;
  }

  /**
   * Start video generation via Gradio v5 call endpoint
   * Returns event_id for SSE polling
   */
  async _startGeneration(imageUrl) {
    const payload = {
      data: [
        {
          path: imageUrl,
          url: imageUrl,
          meta: { _type: 'gradio.FileData' },
          orig_name: 'input.png'
        },
        0,              // seed (0 when randomize=true)
        true,           // randomize_seed
        DEFAULT_MOTION_BUCKET, // motion_bucket_id
        DEFAULT_FPS     // fps
      ]
    };

    const resp = await axios.post(this.baseCallUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const eventId = resp.data?.event_id;
    if (!eventId) throw new Error('Gradio: event_id alinamadi');

    return eventId;
  }

  /**
   * Poll the SSE stream until we get the 'complete' event
   * Parses text/event-stream format
   */
  async _pollResult(eventId, onProgress) {
    const streamUrl = `${this.baseCallUrl}/${eventId}`;
    let lastEvent = null;
    let lastData = null;

    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const resp = await axios.get(streamUrl, {
          timeout: POLL_INTERVAL + 2000,
          responseType: 'text'
        });

        // Parse SSE events from response body
        const events = this._parseSSE(resp.data);

        for (const evt of events) {
          lastEvent = evt.event;
          lastData = evt.data;

          if (evt.event === 'complete') {
            const parsed = JSON.parse(evt.data);
            // Result format: [{ video: {...}, subtitles: null }, seed]
            return parsed[0];
          }

          if (evt.event === 'error') {
            throw new Error(`Gradio: ${evt.data}`);
          }
        }
      } catch (e) {
        // If parsing error or network issue, just retry
        if (e.message && (e.message.includes('Gradio:') || e.message.includes('connect'))) {
          throw e;
        }
      }

      onProgress?.(30 + Math.min(i * 4, 45));

      // Wait before next poll
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error('Gradio: zaman asimi - video olusturulamadi');
  }

  /**
   * Parse text/event-stream format into structured events
   */
  _parseSSE(body) {
    const events = [];
    if (!body) return events;

    // Split by double newline (SSE event delimiter)
    const rawEvents = body.split('\n\n');

    for (const raw of rawEvents) {
      if (!raw.trim()) continue;

      const lines = raw.split('\n');
      let event = 'message';
      let data = null;

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          event = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            data = JSON.parse(line.slice(6).trim());
          } catch {
            data = line.slice(6).trim();
          }
        }
      }

      if (data !== null) {
        events.push({ event, data });
      }
    }

    return events;
  }

  /**
   * Download video from URL and save to results directory
   */
  async _downloadAndSave(videoUrl, jobId, onProgress, onComplete) {
    onProgress?.(85);
    const resp = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 120000
    });

    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const outputPath = path.join(resultsDir, `${jobId}.mp4`);
    fs.writeFileSync(outputPath, Buffer.from(resp.data));

    onProgress?.(100);
    console.log(`[Gradio] Result saved to ${outputPath} (${(resp.data.length / 1024 / 1024).toFixed(1)} MB)`);
    onComplete?.(outputPath);
  }
}

module.exports = { GradioProvider };
