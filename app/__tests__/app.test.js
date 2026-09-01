const request = require('supertest');

const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://signed-url.example.com/zip.zip']);
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        getSignedUrl: mockGetSignedUrl
      }))
    }))
  }))
}));

jest.mock('../../app/photo_model');
let mockFirebaseVal = {
  '2026-09-01': {
    'zip_1': { filename: 'zip_1.zip', storagePath: 'public/users/zip_1.zip', tags: 'paris' }
  }
};
let mockDbRefOnce = jest.fn(() => Promise.resolve({ val: () => mockFirebaseVal }));
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    applicationDefault: jest.fn()
  },
  database: jest.fn(() => ({
    ref: jest.fn(() => ({
      set: jest.fn().mockResolvedValue(true),
      once: mockDbRefOnce
    }))
  }))
}));
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

  test('should respond with a 200 with valid query parameters and cached job file', async () => {
    const jobs = require('../../app/jobs');
    jobs.setJobCompleted('california', 'public/users/zip_california.zip');

    const response = await request(app)
      .get('/?tags=california&tagmode=all')
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toMatch(/<div class="panel panel-default search-results">/);
  });

  test('should handle firebase errors gracefully on index route', async () => {
    mockDbRefOnce.mockRejectedValueOnce(new Error('Firebase DB error'));

    const response = await request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toMatch(/<title>Express App Testing Demo<\/title>/);
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

describe('api zips route', () => {
  afterEach(() => {
    app.server.close();
  });

  test('should respond with json list of zips', () => {
    return request(app)
      .get('/api/zips?prenom=emmanuel')
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        expect(response.body).toHaveProperty('prenom', 'emmanuel');
        expect(response.body).toHaveProperty('zips');
      });
  });

  test('should respond with json list of zips using default prenom and handle entries without storagePath', async () => {
    mockDbRefOnce.mockResolvedValueOnce({
      val: () => ({
        '2026-09-01': {
          'zip_nostorage': { filename: 'zip_nostorage.zip', heure: '2026-09-01' },
          'zip_withstorage': { filename: 'zip_withstorage.zip', storagePath: 'public/users/zip.zip', heure: '2026-09-01' }
        }
      })
    });

    const response = await request(app)
      .get('/api/zips')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('prenom', 'emmanuel');
    expect(response.body.zips).toHaveLength(2);
  });

  test('should handle entries without storagePath on index route', async () => {
    mockDbRefOnce.mockResolvedValueOnce({
      val: () => ({
        '2026-09-01': {
          'zip_nostorage': { filename: 'zip_nostorage.zip', heure: '2026-09-01' }
        }
      })
    });

    const response = await request(app)
      .get('/')
      .expect(200);

    expect(response.text).toMatch(/<title>Express App Testing Demo<\/title>/);
  });

  test('should handle storage signed URL errors gracefully on api zips route', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('GCS signing error'));

    const response = await request(app)
      .get('/api/zips?prenom=emmanuel')
      .expect(200);

    expect(response.body).toHaveProperty('zips');
  });

  test('should handle storage signed URL errors gracefully on index route', async () => {
    const jobs = require('../../app/jobs');
    jobs.setJobCompleted('signedErrorTag', 'public/users/zip_signed_err.zip');
    mockGetSignedUrl.mockRejectedValue(new Error('GCS signing error'));

    const response = await request(app)
      .get('/?tags=signedErrorTag&tagmode=all')
      .expect(200);

    mockGetSignedUrl.mockResolvedValue(['https://signed-url.example.com/zip.zip']);
    expect(response.text).toMatch(/<div class="panel panel-default search-results">/);
  });

  test('should respond with 500 when firebase throws on /api/zips', () => {
    mockDbRefOnce.mockRejectedValueOnce(new Error('Database disconnected'));

    return request(app)
      .get('/api/zips')
      .expect('Content-Type', /json/)
      .expect(500)
      .then(response => {
        expect(response.body).toEqual({ error: 'Database disconnected' });
      });
  });
});
