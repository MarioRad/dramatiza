FROM node:20-alpine

RUN apk add --no-cache docker-cli docker-cli-compose git

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
