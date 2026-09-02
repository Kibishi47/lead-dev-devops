const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const jobs = require('./jobs');
const firebase = require('./firebase');
const { tokenBucketMiddleware } = require('./limiter');
const { Storage } = require('@google-cloud/storage');
const moment = require('moment');

const bucketName = process.env.STORAGE_BUCKET || 'ecni22026bucket';
const storage = new Storage();

function route(app) {
  app.get('/', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;
    const userPrenom = process.env.USER_PRENOM || 'emmanuel';

    // Récupérer les zips sauvegardés dans Firebase
    let savedZips = [];
    try {
      savedZips = await firebase.getZipsByUser(userPrenom);
      // Générer une URL signée pour chaque zip sauvegardé
      for (const zipItem of savedZips) {
        if (zipItem.storagePath) {
          try {
            const options = {
              action: 'read',
              expires: moment().add(2, 'days').unix() * 1000
            };
            const [signedUrl] = await storage
              .bucket(bucketName)
              .file(zipItem.storagePath)
              .getSignedUrl(options);
            zipItem.downloadUrl = signedUrl;
          } catch (err) {
            console.error('Erreur URL signée pour zip historique:', err.message);
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors de la lecture des zips Firebase:', err.message);
    }

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      zipDownloadUrl: null,
      savedZips: savedZips
    };

    // if no input params are passed in then render the view with out querying the api
    if (!tags && !tagmode) {
      return res.render('index', ejsLocalVariables);
    }

    // validate query parameters
    if (!formValidator.hasValidFlickrAPIParams(tags, tagmode)) {
      ejsLocalVariables.invalidParameters = true;
      return res.render('index', ejsLocalVariables);
    }

    try {
      const photos = await photoModel.getFlickrPhotos(tags, tagmode);
      ejsLocalVariables.photos = photos;
      ejsLocalVariables.searchResults = true;

      const fileName = jobs.getJobFile(tags);
      if (fileName) {
        try {
          const options = {
            action: 'read',
            expires: moment().add(2, 'days').unix() * 1000
          };
          const [signedUrl] = await storage
            .bucket(bucketName)
            .file(fileName)
            .getSignedUrl(options);
          ejsLocalVariables.zipDownloadUrl = signedUrl;
        } catch (err) {
          console.error('Erreur lors de la generation de l\'URL signee:', err.message);
        }
      }

      return res.render('index', ejsLocalVariables);
    } catch (error) {
      console.log('aspdfonaposd', error);
      return res.status(500).send({ error });
    }
  });

  // Endpoint pour lire les zips déjà générés depuis Firebase (Étape II)
  app.get('/api/zips', async (req, res) => {
    const userPrenom = req.query.prenom || process.env.USER_PRENOM || 'emmanuel';
    try {
      const zips = await firebase.getZipsByUser(userPrenom);
      for (const zip of zips) {
        if (zip.storagePath) {
          try {
            const options = {
              action: 'read',
              expires: moment().add(2, 'days').unix() * 1000
            };
            const [signedUrl] = await storage
              .bucket(bucketName)
              .file(zip.storagePath)
              .getSignedUrl(options);
            zip.downloadUrl = signedUrl;
          } catch (err) {
            console.error('Erreur sign url api:', err.message);
          }
        }
      }
      return res.json({ prenom: userPrenom, count: zips.length, zips });
    } catch (error) {
      console.error('Erreur /api/zips:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/zip', tokenBucketMiddleware, async (req, res) => {
    const tags = req.query.tags;
    if (!tags) {
      return res.status(400).send({ error: 'Les tags sont requis' });
    }

    try {
      const producer = require('./producer');
      await producer.publishMessage(tags);
      return res.send(`Tags "${tags}" envoyés dans la queue Pub/Sub !`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message :', error);
      return res.status(500).send({ error: error.message });
    }
  });

  // Endpoints MCP (TP MCP)
  const mcp = require('./mcp');
  app.get('/mcp', mcp.mcpAuthMiddleware, mcp.handleMcpGet);
  app.post('/mcp', mcp.mcpAuthMiddleware, mcp.handleMcpPost);
}

module.exports = route;
