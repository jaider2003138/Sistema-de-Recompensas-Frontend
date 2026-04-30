FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY . .

EXPOSE 5173

CMD ["npm", "start"]
