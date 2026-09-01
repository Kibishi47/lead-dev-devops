require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const ZipStream = require('zip-stream');
const got = require('got');
const photoModel = require('./photo_model');
const jobs = require('./jobs');
const firebase = require('./firebase');
const moment = require('moment');

const projectId = process.env.GCP_PROJECT_ID || 'ecni2-2026';
const bucketName = process.env.STORAGE_BUCKET || 'ecni22026bucket';
const studentId = process.env.ECNI2_STUDENT_ID || '1';
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION || `ecni2-${studentId}`;

const pubSubClient = new PubSub({ projectId });
const storage = new Storage({ projectId });

function startWorker() {
  const subscription = pubSubClient.subscription(subscriptionName);

  console.log(`[Worker] Écoute des messages sur la souscription ${subscriptionName}...`);

  subscription.on('message', async (message) => {
    console.log(`[Worker] Message reçu (ID: ${message.id})`);
    try {
      const data = JSON.parse(message.data.toString());
      const tags = data.tags;

      if (!tags) {
        console.warn('[Worker] Message reçu sans tags, acquittement.');
        message.ack();
        return;
      }

      console.log(`[Worker] Traitement du zip pour les tags : "${tags}"`);

      // 1. Récupérer les photos Flickr
      const photos = await photoModel.getFlickrPhotos(tags);
      const top10Photos = photos.slice(0, 10);

      // 2. Initialiser le stream d'upload GCS et ZipStream
      const filename = `zip_${Date.now()}_${Math.random().toString(36).substring(7)}.zip`;
      const gcsFile = storage.bucket(bucketName).file(`public/users/${filename}`);

      const stream = gcsFile.createWriteStream({
        metadata: {
          contentType: 'application/zip',
          cacheControl: 'private'
        },
        resumable: false
      });

      const zip = new ZipStream();
      zip.pipe(stream);

      const uploadPromise = new Promise((resolve, reject) => {
        stream.on('error', (err) => reject(err));
        stream.on('finish', () => resolve('Ok'));
        zip.on('error', (err) => reject(err));
      });

      // 3. Ajouter chaque photo dans le zip-stream
      for (let index = 0; index < top10Photos.length; index++) {
        const photo = top10Photos[index];
        const imageUrl = photo.media.b || photo.media.m;
        try {
          const getFn = got.get || (got.default && got.default.get);
          const response = await getFn(imageUrl, { responseType: 'buffer' });
          const entryName = `photo_${index + 1}.jpg`;
          await new Promise((resolve, reject) => {
            zip.entry(response.body, { name: entryName }, (err, entry) => {
              if (err) reject(err);
              else resolve(entry);
            });
          });
        } catch (err) {
          console.error(`[Worker] Erreur de téléchargement pour ${imageUrl}:`, err.message);
        }
      }

      // Finaliser le zip-stream et attendre la fin de l'upload
      zip.finish();
      await uploadPromise;

      console.log(`[Worker] Zip uploade avec succes sur GCS : public/users/${filename}`);

      // 4. Stocker le statut du job terminé en mémoire et dans Firebase Realtime Database
      const storagePath = `public/users/${filename}`;
      jobs.setJobCompleted(tags, storagePath);

      try {
        const userPrenom = process.env.USER_PRENOM || 'emmanuel';
        const heureDuZippage = moment().format('YYYY-MM-DD_HH-mm-ss');
        await firebase.saveZip(userPrenom, heureDuZippage, filename, {
          tags: tags,
          storagePath: storagePath,
          filename: filename,
          createdAt: new Date().toISOString()
        });
      } catch (fbError) {
        console.error('[Worker] Erreur lors de la sauvegarde Firebase:', fbError.message);
      }

      // 5. Acquitter le message Pub/Sub
      message.ack();
      console.log(`[Worker] Message ${message.id} acquitte (ack).`);
    } catch (error) {
      console.error('[Worker] Erreur lors du traitement du message :', error);
      message.nack();
    }
  });

  subscription.on('error', (error) => {
    console.error('[Worker] Erreur de souscription Pub/Sub :', error);
  });
}

module.exports = {
  startWorker
};
