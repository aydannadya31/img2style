const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ============================================================
// Gradio Spaces SVD Provider
// Uses HuggingFace Spaces with Gradio v5 API to generate video
// from images. No API key required - completely free.
//
// Falls back through multiple Spaces if one fails.
// ============================================================

const TIMEFILES_URL = 'https://tmpfiles.org/api/v1/upload';
const POLL_INTERVAL = 4000;
const MAX_POLLS = 90; // 6 minutes max per Space

// Multiple Space configurations for fallback
const SPACES = [
  {
    // Stable Video Diffusion - Img2Vid XT
    spaceUrl: 'https://multimodalart-stable-video-diffusion.hf.space',
    apiPrefix: '/gradio_api',
    apiName: 'video',
    buildPayload: (imageUrl) => ({
      data: [
        {
          path: imageUrl,
          url: imageUrl,
          meta: { _type: 'gradio.FileData' },
          orig_name: 'input.png'
        },
        0,                    // seed
        true,                 // randomize_seed
        127,                  // motion_bucket_id
        6                     // fps
      ]
    })
  },
  {
    // LTX Video - Image to Video (Lightricks)
    spaceUrl: 'https://lightricks-ltx-video-distilled.hf.space',
    apiPrefix: '/gradio_api',
    apiName: 'image_to_video',
    buildPayload: (imageUrl) => ({
      data: [
        'animate this image with smooth motion', // prompt
        '',                                       // negative_prompt
        {
          path: imageUrl,
          url: imageUrl,
          meta: { _type: 'gradio.FileData' },
          orig_name: 'input.png'
        },
        '',         // input_video_filepath
        576,        // height_ui
        1024,       // width_ui
        'image-to-video', // mode
        3.0,        // duration_ui
        49,         // ui_frames_to_use
        0,          // seed_ui
        true,       // randomize_seed
        3.0,        // ui_guidance_scale
        false       // improve_texture_flag
      ]
    })
  }
];

class GradioProvider {
  constructor(options = {}) {
    this.spaces = options.spaces || SPACES;
  }

  /**
   * Generate video from an image using Gradio Spaces with fallback
   */
  async generate(jobId, imagePath, callbacks = {}) {
    const { onProgress, onComplete, onError } = callbacks;

    try {
      onProgress?.(5);

      // 1. Upload image to temp hosting for a public URL
      const imageUrl = await this._uploadImage(imagePath);
      onProgress?.(15);

      // 2. Try each Space in order
      let lastError = null;
      for (const space of this.spaces) {
        onProgress?.(20);
        try {
          console.log(`[Gradio] Trying Space: ${space.spaceUrl}/${space.apiName}`);

          const resultData = await this._trySpace(space, imageUrl, onProgress);

          // Download and save the video
          const videoUrl = resultData?.video?.url;
          if (!videoUrl) throw new Error('video URL bulunamadi');

          onProgress?.(85);
          await this._downloadAndSave(videoUrl, jobId, onProgress, onComplete);
          return; // success

        } catch (err) {
          lastError = err;
          console.log(`[Gradio] Space ${space.spaceUrl} failed: ${err.message}`);
          onProgress?.(20);
        }
      }

      throw lastError || new Error('Gradio: tum spaceler basarisiz');

    } catch (error) {
      console.error(`[Gradio] Job ${jobId} failed:`, error.message);
      onError?.(error);
    }
  }

  /**
   * Try a single Space endpoint
   */
  async _trySpace(space, imageUrl, onProgress) {
    const baseCallUrl = `${space.spaceUrl}${space.apiPrefix}/call/${space.apiName}`;

    // 2a. Start generation
    const payload = space.buildPayload(imageUrl);
    const resp = await axios.post(baseCallUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const eventId = resp.data?.event_id;
    if (!eventId) throw new Error('event_id alinamadi');

    // 2b. Poll for result
    return await this._pollResult(baseCallUrl, eventId, onProgress);
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

    const rawUrl = resp.data?.data?.url;
    if (!rawUrl) throw new Error('tmpfiles upload failed');

    // Convert tmpfiles.org/dl/... to direct download URL
    const directUrl = rawUrl.replace('/dl/', '/');
    return directUrl;
  }

  /**
   * Poll the SSE stream until we get the 'complete' event
   */
  async _pollResult(baseCallUrl, eventId, onProgress) {
    const streamUrl = `${baseCallUrl}/${eventId}`;

    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const resp = await axios.get(streamUrl, {
          timeout: POLL_INTERVAL + 2000,
          responseType: 'text'
        });

        // Parse SSE events
        const events = this._parseSSE(resp.data);

        for (const evt of events) {
          if (evt.event === 'complete') {
            // Result: [{ video: {...}, subtitles: null }, seed]
            const parsed = JSON.parse(evt.data);
            return parsed[0];
          }

          if (evt.event === 'error') {
            const errorMsg = typeof evt.data === 'string'
              ? evt.data
              : (evt.data?.error || JSON.stringify(evt.data) || 'bilinmeyen hata');
            throw new Error(errorMsg === 'null' ? 'Space GPU hatasi (kota dolmus olabilir)' : errorMsg);
          }
        }
      } catch (e) {
        // Re-throw Gradio errors and connection errors
        if (e.message && (
          e.message.includes('Space GPU') ||
          e.message.includes('event_id') ||
          e.message.includes('tmpfiles') ||
          e.message.includes('video URL') ||
          e.message.includes('connect') ||
          e.message === 'bilinmeyen hata'
        )) {
          throw e;
        }
        // Otherwise retry (network blip, parsing issue, etc.)
      }

      onProgress?.(25 + Math.min(i * 2, 45));
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error('zaman asimi - video olusturulamadi');
  }

  /**
   * Parse text/event-stream format into structured events
   */
  _parseSSE(body) {
    const events = [];
    if (!body) return events;

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
          const rawData = line.slice(6).trim();
          try {
            data = JSON.parse(rawData);
          } catch {
            data = rawData;
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
