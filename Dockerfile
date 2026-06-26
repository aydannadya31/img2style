FROM node:20-slim

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY . .

WORKDIR /app/backend

EXPOSE 10000

CMD ["node", "server.js"]
