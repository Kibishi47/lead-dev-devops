const formValidator = require('./form_validator');
const photoModel = require('./photo_model');
const jobs = require('./jobs');
const { Storage } = require('@google-cloud/storage');
const moment = require('moment');

const bucketName = process.env.STORAGE_BUCKET || 'ecni22026bucket';
const storage = new Storage();

function route(app) {
  app.get('/', async (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false,
      zipDownloadUrl: null
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

  app.post('/zip', async (req, res) => {
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
}

module.exports = route;
