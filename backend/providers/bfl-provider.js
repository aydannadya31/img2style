const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class BFLProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.bfl.ai/v1';
  }

  async generate(jobId, modelImagePath, clothImagePath, callbacks) {
    const onProgress = callbacks.onProgress || function() {};
    const onComplete = callbacks.onComplete || function() {};
    const onError = callbacks.onError || function() {};

    try {
      onProgress(10);
      const modelUrl = await this.uploadToTemp(modelImagePath);
      onProgress(20);
      const clothUrl = await this.uploadToTemp(clothImagePath);

      onProgress(30);
      const task = await this.submitVTO(modelUrl, clothUrl);

      onProgress(50);
      const resultUrl = await this.pollForResult(task.polling_url, function(p) {
        onProgress(50 + Math.floor(p * 0.45));
      });

      onProgress(95);
      const resultPath = await this.downloadResult(resultUrl, jobId);
      onProgress(100);
      onComplete(resultPath);

    } catch (error) {
      console.error('BFL job ' + jobId + ' failed: ' + error.message);
      onError(error);
    }
  }

  async uploadToTemp(filePath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const resp = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    let url = '';
    if (resp.data && resp.data.data && resp.data.data.url) {
      url = resp.data.data.url;
    } else if (resp.data && resp.data.url) {
      url = resp.data.url;
    } else {
      throw new Error('Failed to upload image');
    }

    url = url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return url;
  }

  async submitVTO(personImageUrl, garmentImageUrl) {
    const resp = await axios.post(this.baseUrl + '/flux-tools/vto-v1', {
      prompt: 'TRY-ON: The person of image 1 wearing the garments of image 2.',
      person: personImageUrl,
      garment: garmentImageUrl
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-key': this.apiKey
      },
      timeout: 30000
    });

    if (!resp.data || !resp.data.id) {
      throw new Error('BFL API did not return a task ID');
    }
    return { id: resp.data.id, polling_url: resp.data.polling_url };
  }

  async pollForResult(pollingUrl, onProgress) {
    for (let i = 0; i < 120; i++) {
      try {
        const resp = await axios.get(pollingUrl, {
          headers: { 'x-key': this.apiKey },
          timeout: 10000
        });

        const data = resp.data;
        if (data.status === 'Ready') {
          const imageUrl = (data.result && (data.result.sample || data.result.image)) || (Array.isArray(data.result) && data.result[0]);
          if (imageUrl) return imageUrl;
          throw new Error('Result URL not found');
        }

        if (data.status === 'Failed' || data.status === 'Error') {
          throw new Error(data.error || 'BFL API returned error');
        }

        const progressMap = { Pending: 0.1, Processing: 0.3, Generating: 0.5, Finalizing: 0.8 };
        onProgress(progressMap[data.status] || 0.3);

      } catch (error) {
        if (error.message.indexOf('Result') >= 0 || error.message.indexOf('error') >= 0 || error.message.indexOf('Error') >= 0 || error.message.indexOf('Failed') >= 0) throw error;
      }

      await new Promise(function(r) { setTimeout(r, 2000); });
    }

    throw new Error('BFL API polling timed out');
  }

  async downloadResult(imageUrl, jobId) {
    const resultsDir = path.join(__dirname, '..', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    var parts = imageUrl.split('.');
    var ext = parts.length > 1 ? '.' + parts[parts.length - 1].split('?')[0] : '.png';
    var outputPath = path.join(resultsDir, jobId + ext);

    var resp = await axios({ method: 'GET', url: imageUrl, responseType: 'stream', timeout: 60000 });
    var writer = fs.createWriteStream(outputPath);
    resp.data.pipe(writer);

    return new Promise(function(resolve, reject) {
      writer.on('finish', function() { resolve(outputPath); });
      writer.on('error', reject);
    });
  }
}

module.exports = { BFLProvider };
