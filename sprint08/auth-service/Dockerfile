# Stage 1 - Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json .

RUN npm ci

COPY . .

RUN npm run build



# Stage 2 - Runtime
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json .

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist


EXPOSE ${PORT}


CMD ["npm","start"]