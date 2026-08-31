const request = require('supertest');

jest.mock('../../app/photo_model');
jest.mock('../../app/producer', () => ({
  publishMessage: jest.fn(tags => {
    if (tags === 'error') {
      return Promise.reject(new Error('Publish failed'));
    }
    return Promise.resolve('msg-123');
  })
}));

const app = require('../../app/server');

describe('index route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with a 200 with no query parameters', () => {
    return request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<title>Express App Testing Demo<\/title>/
        );
      });
  });

  test('should respond with a 200 with valid query parameters', () => {
    return request(app)
      .get('/?tags=california&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(
          /<div class="panel panel-default search-results">/
        );
      });
  });

  test('should respond with a 200 with invalid query parameters', () => {
    return request(app)
      .get('/?tags=california123&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(/<div class="alert alert-danger">/);
      });
  });

  test('should respond with a 500 error due to bad jsonp data', () => {
    return request(app)
      .get('/?tags=error&tagmode=all')
      .expect('Content-Type', /json/)
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Internal server error' });
      });
  });
});

describe('zip route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with 400 if no tags parameter is provided', () => {
    return request(app)
      .post('/zip')
      .expect(400)
      .then(response => {
        expect(response.body).toEqual({ error: 'Les tags sont requis' });
      });
  });

  test('should respond with 200 when publishing message successfully', () => {
    return request(app)
      .post('/zip?tags=california')
      .expect(200)
      .then(response => {
        expect(response.text).toMatch(/Tags "california" envoyés dans la queue Pub\/Sub !/);
      });
  });

  test('should respond with 500 when producer throws an error', () => {
    return request(app)
      .post('/zip?tags=error')
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Publish failed' });
      });
  });
});
