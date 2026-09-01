require('dotenv').config();
const admin = require('firebase-admin');

const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://ecni2-2026-default-rtdb.firebaseio.com';

if (!admin.apps || !admin.apps.length) {
  const options = { databaseURL };
  if (admin.credential && typeof admin.credential.applicationDefault === 'function') {
    options.credential = admin.credential.applicationDefault();
  }
  admin.initializeApp(options);
}

const db = typeof admin.database === 'function' ? admin.database() : { ref: () => ({ set: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }) }) };

async function saveZip(prenom, heure, filename, zipData) {
  const safePrenom = (prenom || 'emmanuel').replace(/[.#$/[\]]/g, '_');
  const safeHeure = (heure || Date.now().toString()).replace(/[.#$/[\]]/g, '_');
  const safeFilename = filename.replace(/[.#$/[\]]/g, '_');

  const refPath = `${safePrenom}/${safeHeure}/${safeFilename}`;
  await db.ref(refPath).set(zipData);
  console.log(`[Firebase] Données du zip sauvegardées sous : ${refPath}`);
  return refPath;
}

async function getZipsByUser(prenom) {
  const safePrenom = (prenom || 'emmanuel').replace(/[.#$/[\]]/g, '_');
  const snapshot = await db.ref(safePrenom).once('value');
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
