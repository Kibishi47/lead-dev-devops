require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const { Storage } = require('@google-cloud/storage');
const moment = require('moment');

const photoModel = require('./photo_model');
const firebase = require('./firebase');

const bucketName = process.env.STORAGE_BUCKET || 'ecni22026bucket';
const storage = new Storage();
const expectedApiKey = process.env.MCP_API_KEY || 'MY_HARDCODED_API_KEY';

// Création du serveur MCP
function createMcpServer() {
  const server = new McpServer({
    name: 'Flickr-Archive-MCP-Server',
    version: '1.0.0'
  });

  // 1. Méthode pour faire une recherche de photos sur Flickr
  server.registerTool(
    'search_flickr_photos',
    {
      description: 'Recherche des photos sur Flickr selon des tags et un mode (all/any)',
      inputSchema: {
        tags: z.string().describe('Tags séparés par des virgules (ex: "paris, eiffel")'),
        tagmode: z.enum(['all', 'any']).optional().describe('Mode de recherche des tags ("all" ou "any")')
      }
    },
    async ({ tags, tagmode }) => {
      try {
        const photos = await photoModel.getFlickrPhotos(tags, tagmode || 'all');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(photos, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Erreur lors de la recherche Flickr : ${err.message}`
            }
          ]
        };
      }
    }
  );

  // 2. Méthode pour lister les archives existantes dans Firebase
  server.registerTool(
    'list_archives',
    {
      description: 'Liste les archives zips existantes créées pour un utilisateur',
      inputSchema: {
        prenom: z.string().optional().describe('Prénom de l\'utilisateur (par défaut: process.env.USER_PRENOM ou "emmanuel")')
      }
    },
    async ({ prenom }) => {
      try {
        const user = prenom || process.env.USER_PRENOM || 'emmanuel';
        const zips = await firebase.getZipsByUser(user);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ prenom: user, count: zips.length, zips }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Erreur lors de la récupération des archives : ${err.message}`
            }
          ]
        };
      }
    }
  );

  // 3. Méthode pour récupérer une download URL signée pour un zip précédemment créé
  server.registerTool(
    'get_zip_download_url',
    {
      description: 'Génère une URL signée de téléchargement (valide 2 jours) pour un zip stocké dans Google Cloud Storage',
      inputSchema: {
        storagePath: z.string().describe('Chemin du fichier zip dans le bucket GCS (ex: "public/users/zip_123.zip")')
      }
    },
    async ({ storagePath }) => {
      try {
        const options = {
          action: 'read',
          expires: moment().add(2, 'days').unix() * 1000
        };
        const [signedUrl] = await storage
          .bucket(bucketName)
          .file(storagePath)
          .getSignedUrl(options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ storagePath, downloadUrl: signedUrl }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Erreur lors de la génération de l'URL de téléchargement : ${err.message}`
            }
          ]
        };
      }
    }
  );

  return server;
}

// Map des transports SSE actifs
const activeTransports = new Map();

// Middleware d'authentification Bearer
function mcpAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${expectedApiKey}`) {
    return res.status(401).json({
      error: 'Unauthorized: missing or invalid Bearer token. Format: "Bearer MY_HARDCODED_API_KEY"'
    });
  }
  next();
}

// Handler GET /mcp (SSE connection)
async function handleMcpGet(req, res) {
  const transport = new SSEServerTransport('/mcp', res);
  const server = createMcpServer();

  activeTransports.set(transport.sessionId, transport);

  res.on('close', () => {
    activeTransports.delete(transport.sessionId);
  });

  await server.connect(transport);
}

// Handler POST /mcp (Incoming messages)
async function handleMcpPost(req, res) {
  const sessionId = req.query.sessionId || req.headers['x-session-id'];
  const transport = sessionId
    ? activeTransports.get(sessionId)
    : activeTransports.values().next().value;

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: 'Session non trouvée ou transport expiré' });
  }
}

module.exports = {
  createMcpServer,
  mcpAuthMiddleware,
  handleMcpGet,
  handleMcpPost,
  activeTransports,
  expectedApiKey
};
