# syntax = docker/dockerfile:1
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Static server with SPA fallback (fixes 404 on refresh for /dashboard etc) ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Nginx serves from /usr/share/nginx/html by default
COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
