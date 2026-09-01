FROM node:alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "if [ -n \"$GCP_KEY_JSON\" ]; then echo \"$GCP_KEY_JSON\" > ./gcp-key.json; fi && if [ -n \"$FIREBASE_CONFIG_JSON\" ]; then echo \"$FIREBASE_CONFIG_JSON\" > ./firebase-config.json && mkdir -p ./app/public && echo \"$FIREBASE_CONFIG_JSON\" > ./app/public/firebase-config.json; fi && node app/server.js"]
