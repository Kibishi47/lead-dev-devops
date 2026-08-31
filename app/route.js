const formValidator = require('./form_validator');
const photoModel = require('./photo_model');

function route(app) {
  app.get('/', (req, res) => {
    const tags = req.query.tags;
    const tagmode = req.query.tagmode;

    const ejsLocalVariables = {
      tagsParameter: tags || '',
      tagmodeParameter: tagmode || '',
      photos: [],
      searchResults: false,
      invalidParameters: false
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

    // get photos from flickr public feed api
    return photoModel
      .getFlickrPhotos(tags, tagmode)
      .then(photos => {
        ejsLocalVariables.photos = photos;
        ejsLocalVariables.searchResults = true;
        return res.render('index', ejsLocalVariables);
      })
      .catch(error => {
        console.log('aspdfonaposd', error)
        return res.status(500).send({ error });
      });
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
