# ---- Backend: Node/Express API ----
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (separate layer so `npm install` is only re-run
# when package.json actually changes, not on every source edit).
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN chmod +x docker-entrypoint.sh

# Runs as a non-root user — if this container is ever compromised via a
# dependency vulnerability or app bug, the attacker doesn't get root inside it.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
