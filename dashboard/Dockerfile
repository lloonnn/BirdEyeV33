# Dashboard image. Build context is dashboard/. Started by backend/docker-compose.yml.
# NEXT_PUBLIC_* values are fixed at build time, so compose passes them as build args.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_MODE=real
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_CARTO_KEY=
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_CARTO_KEY=$NEXT_PUBLIC_CARTO_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
