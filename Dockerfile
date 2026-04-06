FROM node:18

WORKDIR /app

COPY finance-backend/package*.json ./
RUN npm install

COPY finance-backend/ ./

EXPOSE 4000

CMD ["node", "server.js"]