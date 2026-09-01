const mockSet = jest.fn();
const mockOnce = jest.fn();
const mockChild2 = jest.fn(() => ({
  set: mockSet
}));
const mockChild1 = jest.fn(() => ({
  child: mockChild2,
  set: mockSet
}));
const mockRef = jest.fn(() => ({
  child: mockChild1,
  set: mockSet,
  once: mockOnce
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(() => ({})),
  getApps: jest.fn(() => [])
}));

jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: mockRef
  }))
}));

describe('firebase.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saveZip should set zip data at sanitized path', async () => {
    mockSet.mockResolvedValue(true);
    const firebase = require('../firebase');

    const path = await firebase.saveZip('emmanuel', '2026-09-01', 'zip_123.zip', {
      tags: 'paris',
      storagePath: 'public/users/zip_123.zip'
    });

    expect(path).toBe('emmanuel/2026-09-01/zip_123_zip');
    expect(mockRef).toHaveBeenCalledWith('emmanuel');
    expect(mockChild1).toHaveBeenCalledWith('2026-09-01');
    expect(mockChild2).toHaveBeenCalledWith('zip_123_zip');
    expect(mockSet).toHaveBeenCalledWith({
      tags: 'paris',
      storagePath: 'public/users/zip_123.zip'
    });
  });

  test('saveZip should use default values when prenom and heure are not provided', async () => {
    mockSet.mockResolvedValue(true);
    const firebase = require('../firebase');

    const path = await firebase.saveZip(null, null, 'archive.zip', {
      tags: 'nature'
    });

    expect(path).toMatch(/^emmanuel\/.*\/archive_zip$/);
  });

  test('getZipsByUser should return formatted array of zips', async () => {
    mockOnce.mockResolvedValue({
      val: () => ({
        '2026-09-01_10-00': {
          'zip_1': { tags: 'france', filename: 'zip_1.zip', storagePath: 'public/users/zip_1.zip' },
          'invalid_entry': null
        }
      })
    });
    const firebase = require('../firebase');

    const zips = await firebase.getZipsByUser('emmanuel');
    expect(zips).toHaveLength(1);
    expect(zips[0].tags).toBe('france');
    expect(zips[0].heure).toBe('2026-09-01_10-00');
  });

  test('getZipsByUser should fallback to default prenom when not provided', async () => {
    mockOnce.mockResolvedValue({
      val: () => null
    });
    const firebase = require('../firebase');

    const zips = await firebase.getZipsByUser(null);
    expect(zips).toEqual([]);
    expect(mockRef).toHaveBeenCalledWith('emmanuel');
  });

  test('should handle broken firebase-config.json file gracefully', () => {
    jest.isolateModules(() => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => typeof p === 'string' && p.includes('firebase-config.json'));
      jest.spyOn(fs, 'readFileSync').mockReturnValue('broken json {');
      const firebase = require('../firebase');
      expect(firebase).toBeDefined();
      fs.existsSync.mockRestore();
      fs.readFileSync.mockRestore();
    });
  });

  test('should handle broken gcp-key.json file gracefully', () => {
    jest.isolateModules(() => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => typeof p === 'string' && p.includes('gcp-key.json'));
      jest.spyOn(fs, 'readFileSync').mockReturnValue('broken json {');
      const firebase = require('../firebase');
      expect(firebase).toBeDefined();
      fs.existsSync.mockRestore();
      fs.readFileSync.mockRestore();
    });
  });
});
