FROM node:alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "if [ -n \"$GCP_KEY_JSON\" ]; then echo \"$GCP_KEY_JSON\" > ./gcp-key.json; fi && node app/server.js"]
