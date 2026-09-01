require('dotenv').config();
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs = require('fs');
const path = require('path');

let firebaseConfig = {};
const configPath = path.join(__dirname, '..', 'firebase-config.json');
const gcpKeyPath = path.join(__dirname, '..', 'gcp-key.json');

if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('Erreur lecture firebase-config.json:', e.message);
  }
}

const databaseURL = firebaseConfig.databaseURL || 'https://ecni2-2026-default-rtdb.firebaseio.com';

let credential;
if (fs.existsSync(gcpKeyPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(gcpKeyPath, 'utf8'));
    if (serviceAccount.project_id && serviceAccount.private_key) {
      credential = cert(serviceAccount);
    }
  } catch (e) {
    console.error('Erreur lecture gcp-key.json:', e.message);
  }
}

if (!getApps().length) {
  const options = { databaseURL };
  if (credential) {
    options.credential = credential;
  }
  initializeApp(options);
}

const db = getDatabase();

/**
 * Sauvegarde d'un zip selon la doc Firebase Admin Node.js:
 * https://firebase.google.com/docs/database/admin/save-data#node.js
 */
async function saveZip(prenom, heure, filename, zipData) {
  const safePrenom = (prenom || 'emmanuel').replace(/[.#$/[\]]/g, '_');
  const safeHeure = (heure || Date.now().toString()).replace(/[.#$/[\]]/g, '_');
  const safeFilename = filename.replace(/[.#$/[\]]/g, '_');

  const refPath = `${safePrenom}/${safeHeure}/${safeFilename}`;
  const ref = db.ref(safePrenom).child(safeHeure).child(safeFilename);
  await ref.set(zipData);
  console.log(`[Firebase] Données du zip sauvegardées sous : ${refPath}`);
  return refPath;
}

/**
 * Lecture des zips selon la doc Firebase:
 * https://firebase.google.com/docs/database/web/read-and-write
 */
async function getZipsByUser(prenom) {
  const safePrenom = (prenom || 'emmanuel').replace(/[.#$/[\]]/g, '_');
  const ref = db.ref(safePrenom);
  const snapshot = await ref.once('value');
  const data = snapshot.val();
  if (!data) {
    return [];
  }

  const zips = [];
  Object.keys(data).forEach((heureKey) => {
    const hourGroup = data[heureKey];
    if (hourGroup && typeof hourGroup === 'object') {
      Object.keys(hourGroup).forEach((fileKey) => {
        const item = hourGroup[fileKey];
        if (item && typeof item === 'object') {
          zips.push({
            heure: heureKey,
            fileKey: fileKey,
            ...item
          });
        }
      });
    }
  });

  return zips;
}

module.exports = {
  db,
  saveZip,
  getZipsByUser
};
