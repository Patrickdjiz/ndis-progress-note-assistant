FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM pierrezemb/gostatic
COPY --from=build /app/dist /srv/http
CMD ["-port","8080","-https-promote","-enable-logging"]
