# ---- Stage 1: build the static assets ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Vite bakes VITE_* env vars in at BUILD time, not runtime — so this has to be
# a build arg, passed in via docker-compose.yml or `docker build --build-arg`.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY . .
RUN npm run build

# ---- Stage 2: serve the built assets with nginx ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
