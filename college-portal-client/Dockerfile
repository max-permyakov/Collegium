# syntax=docker/dockerfile:1
# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
# npm reads legacy-peer-deps from .npmrc; the flag is a safety net.
# The lockfile resolves a peer conflict between eslint 10 and
# eslint-plugin-react (which declares support up to eslint 9).
RUN npm ci --legacy-peer-deps

COPY . .

# The SPA calls the API on the same origin (reverse-proxied by nginx),
# so the default base path is "/api".
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
