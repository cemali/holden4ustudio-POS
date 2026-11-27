# Dockerfile - holden4ustudio-POS server
# Node 26 is the Active LTS line (Oct 2026 -> security support to Apr 2029).

# ---------- Stage 1: install production dependencies ----------
FROM node:26-alpine AS deps
WORKDIR /app

# Copy only the manifests first so Docker can cache the npm install layer.
COPY package.json package-lock.json ./

# Reproducible install from the lockfile; skip devDependencies (nodemon).
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: runtime image ----------
FROM node:26-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8001

# Bring in the installed packages, then the app source.
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# NeDB writes its .db files here. Create it owned by the non-root "node" user.
# In Kubernetes, mount a PersistentVolume at /app/databases so data survives restarts.
RUN mkdir -p /app/databases && chown node:node /app/databases
VOLUME ["/app/databases"]

# Don't run as root.
USER node

EXPOSE 8001

# Container health check using Node's built-in fetch (no curl in alpine).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]