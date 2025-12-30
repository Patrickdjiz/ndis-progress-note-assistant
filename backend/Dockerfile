# syntax = docker/dockerfile:1
FROM node:22-slim

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

ENV NODE_ENV=production

# Fly will route to whatever PORT you set; we'll use 3000 to match fly.toml
EXPOSE 3000

CMD ["npm", "run", "start"]
