# Img2Style

**Cloth Swap / Virtual Try-On** — Upload a model photo and a garment photo, and let AI generate the result.

Powered by [Black Forest Labs FLUX VTO API](https://docs.bfl.ai/).

## Setup

```bash
# Install dependencies
cd backend
npm install

# Configure environment
cp ../.env.example ../.env
# Edit .env: set your BFL_API_KEY

# Start
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Check if BFL API is connected |
| `/api/generate` | POST | Upload model+cloth images (multipart: `modelImage`, `clothImage`) — returns `jobId` |
| `/api/status/:jobId` | GET | Poll job progress and get result URL |
| `/api/samples` | GET | Sample model and clothing images |
| `/api/set-key` | POST | Update BFL API key at runtime (`{ "apiKey": "..." }`) |

## Env Variables

| Variable | Required | Description |
|---|---|---|
| `BFL_API_KEY` | Yes | Black Forest Labs API key |
| `PORT` | No | Server port (default: 3001) |

## Frontend

The web UI (HTML + vanilla JS + CSS) is served at `/`.
