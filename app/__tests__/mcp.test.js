const request = require('supertest');
const express = require('express');

let mockGetSignedUrl = jest.fn().mockResolvedValue(['https://signed-url.example.com/zip.zip']);
jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        getSignedUrl: mockGetSignedUrl
      }))
    }))
  }))
}));

jest.mock('../photo_model', () => ({
  getFlickrPhotos: jest.fn((tags) => {
    if (tags === 'error') {
      return Promise.reject(new Error('Flickr API network error'));
    }
    return Promise.resolve([
      { title: 'Photo 1', media: { m: 'https://example.com/p1.jpg' } }
    ]);
  })
}));

let mockZipsVal = [
  { filename: 'zip_1.zip', storagePath: 'public/users/zip_1.zip', tags: 'paris' }
];
jest.mock('../firebase', () => ({
  getZipsByUser: jest.fn((prenom) => {
    if (prenom === 'error_user') {
      return Promise.reject(new Error('Firebase DB error'));
    }
    return Promise.resolve(mockZipsVal);
  })
}));

describe('mcp.js', () => {
  let mcp;
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mcp = require('../mcp');
    app = express();
    app.use(express.json());
    app.get('/mcp', mcp.mcpAuthMiddleware, mcp.handleMcpGet);
    app.post('/mcp', mcp.mcpAuthMiddleware, mcp.handleMcpPost);
  });

  describe('mcpAuthMiddleware', () => {
    test('should reject request without Authorization header', async () => {
      const res = await request(app).get('/mcp');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    test('should reject request with invalid Bearer token', async () => {
      const res = await request(app)
        .get('/mcp')
        .set('Authorization', 'Bearer WRONG_KEY');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Unauthorized/i);
    });

    test('should accept request with valid Bearer token and call next', () => {
      const req = { headers: { authorization: `Bearer ${mcp.expectedApiKey}` } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      mcp.mcpAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createMcpServer and tools', () => {
    let server;
    let registeredTools;

    beforeEach(() => {
      server = mcp.createMcpServer();
      registeredTools = server._registeredTools || {};
    });

    test('should register the 3 required MCP tools', () => {
      expect(registeredTools['search_flickr_photos']).toBeDefined();
      expect(registeredTools['list_archives']).toBeDefined();
      expect(registeredTools['get_zip_download_url']).toBeDefined();
    });

    test('search_flickr_photos should return photos on success', async () => {
      const tool = registeredTools['search_flickr_photos'];
      const result = await tool.handler({ tags: 'paris', tagmode: 'all' });
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Photo 1');
    });

    test('search_flickr_photos should handle error gracefully', async () => {
      const tool = registeredTools['search_flickr_photos'];
      const result = await tool.handler({ tags: 'error', tagmode: 'all' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Erreur lors de la recherche Flickr');
    });

    test('list_archives should return archives list on success', async () => {
      const tool = registeredTools['list_archives'];
      const result = await tool.handler({ prenom: 'emmanuel' });
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('zip_1.zip');
    });

    test('list_archives should fallback to default prenom when omitted', async () => {
      const tool = registeredTools['list_archives'];
      const result = await tool.handler({});
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('emmanuel');
    });

    test('list_archives should handle error gracefully', async () => {
      const tool = registeredTools['list_archives'];
      const result = await tool.handler({ prenom: 'error_user' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Erreur lors de la récupération des archives');
    });

    test('get_zip_download_url should return signed URL on success', async () => {
      const tool = registeredTools['get_zip_download_url'];
      const result = await tool.handler({ storagePath: 'public/users/zip_123.zip' });
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('https://signed-url.example.com/zip.zip');
    });

    test('get_zip_download_url should handle storage error gracefully', async () => {
      mockGetSignedUrl.mockRejectedValueOnce(new Error('GCS signing failure'));
      const tool = registeredTools['get_zip_download_url'];
      const result = await tool.handler({ storagePath: 'public/users/zip_broken.zip' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Erreur lors de la génération de l\'URL');
    });
  });

  describe('handleMcpGet', () => {
    test('should start SSE transport and clean up on close', async () => {
      const EventEmitter = require('events');
      const res = new EventEmitter();
      res.writeHead = jest.fn();
      res.write = jest.fn();
      res.flush = jest.fn();

      const req = {};
      await mcp.handleMcpGet(req, res);

      expect(mcp.activeTransports.size).toBeGreaterThan(0);
      res.emit('close');
      expect(mcp.activeTransports.size).toBe(0);
    });
  });

  describe('handleMcpPost', () => {
    test('should return 400 when session is not found and no active transport exists', async () => {
      mcp.activeTransports.clear();
      const res = await request(app)
        .post('/mcp?sessionId=unknown-session')
        .set('Authorization', `Bearer ${mcp.expectedApiKey}`)
        .send({ jsonrpc: '2.0', method: 'ping', id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Session non trouvée/i);
    });

    test('should delegate to transport when active session exists by query param', async () => {
      const mockTransport = {
        handlePostMessage: jest.fn().mockImplementation((req, res) => {
          res.status(200).json({ jsonrpc: '2.0', result: 'pong', id: 1 });
        })
      };
      mcp.activeTransports.set('test-session', mockTransport);

      const res = await request(app)
        .post('/mcp?sessionId=test-session')
        .set('Authorization', `Bearer ${mcp.expectedApiKey}`)
        .send({ jsonrpc: '2.0', method: 'ping', id: 1 });

      expect(res.status).toBe(200);
      expect(mockTransport.handlePostMessage).toHaveBeenCalled();
      mcp.activeTransports.delete('test-session');
    });

    test('should delegate to transport when session is in header', async () => {
      const mockTransport = {
        handlePostMessage: jest.fn().mockImplementation((req, res) => {
          res.status(200).json({ jsonrpc: '2.0', result: 'pong', id: 2 });
        })
      };
      mcp.activeTransports.set('header-session', mockTransport);

      const res = await request(app)
        .post('/mcp')
        .set('Authorization', `Bearer ${mcp.expectedApiKey}`)
        .set('x-session-id', 'header-session')
        .send({ jsonrpc: '2.0', method: 'ping', id: 2 });

      expect(res.status).toBe(200);
      expect(mockTransport.handlePostMessage).toHaveBeenCalled();
      mcp.activeTransports.delete('header-session');
    });
  });
});
