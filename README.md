# Image to Video

Upload a single image and generate a video using AI. Supports a fallback chain of multiple providers.

## Provider Chain (fallback order)

1. **HuggingFace SVD** — Stable Video Diffusion on HF Inference API
2. **Agnes AI** — Free video generation API
3. **HappyHorse** (Muapi) — Fallback API provider

## Setup

```bash
# Install dependencies
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env: set your API keys

# Start
npm start
```

## Env Variables

| Variable | Required | Description |
|---|---|---|
| `HF_TOKEN` | No | HuggingFace Inference API token |
| `AGNES_API_KEY` | No | Agnes AI API key |
| `MUAPI_API_KEY` | No | Muapi/HappyHorse API key |
| `PORT` | No | Server port (default: 3001) |

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/generate` | POST | Upload image (`image` field, multipart) — returns `jobId` |
| `/api/status/:jobId` | GET | Poll job progress and get result URL |
| `/api/status` | GET | Server health + enabled providers |
| `/api/providers` | GET | List all providers with availability status |
| `/api/set-key` | POST | Add/replace API key at runtime (`{ "provider": "hf|agnes|muapi", "apiKey": "..." }`) |
| `/api/samples` | GET | Sample scene images |

## Frontend

The web UI is served at `/` from the `frontend/` directory.
