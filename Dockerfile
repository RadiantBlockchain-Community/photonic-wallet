# Photonic Wallet - Multi-stage Docker Build
# Serves the built web app via nginx

# Stage 1: Build
FROM node:18-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency files first (for layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches/ ./patches/
COPY packages/config-eslint/package.json ./packages/config-eslint/
COPY packages/config-typescript/ ./packages/config-typescript/
COPY packages/lib/package.json ./packages/lib/
COPY packages/app/package.json ./packages/app/
COPY packages/cli/package.json ./packages/cli/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/

# Build the web app
RUN pnpm build

# Stage 2: Serve with nginx
FROM nginx:alpine AS production

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html

# Security: run as non-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
