const EventEmitter = require('events');

const mockSubscription = new EventEmitter();
const mockPubSubClient = {
  subscription: jest.fn(() => mockSubscription)
};

const mockFile = {
  createWriteStream: jest.fn()
};

const mockBucket = {
  file: jest.fn(() => mockFile)
};

const mockStorage = {
  bucket: jest.fn(() => mockBucket)
};

jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => mockPubSubClient)
}));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => mockStorage)
}));

jest.mock('got', () => {
  return {
    get: jest.fn().mockResolvedValue({ body: Buffer.from('fake-image-bytes') }),
    default: {
      get: jest.fn().mockResolvedValue({ body: Buffer.from('fake-image-bytes') })
    }
  };
});

jest.mock('../photo_model', () => ({
  getFlickrPhotos: jest.fn().mockResolvedValue([
    { media: { b: 'http://example.com/photo1.jpg' } },
    { media: { m: 'http://example.com/photo2.jpg' } }
  ])
}));

jest.mock('../firebase', () => ({
  saveZip: jest.fn().mockResolvedValue('emmanuel/heure/zip_123')
}));

describe('worker.js', () => {
  let worker;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscription.removeAllListeners();
    process.env = { ...originalEnv };
    worker = require('../worker');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should start listening and process a valid message', async () => {
    worker.startWorker();

    const mockStream = new EventEmitter();
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit('finish'));
    });
    mockFile.createWriteStream.mockReturnValue(mockStream);

    const message = {
      id: 'msg-1',
      data: Buffer.from(JSON.stringify({ tags: 'nature' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(message.ack).toHaveBeenCalled();
  });

  test('should process photos with only media.m', async () => {
    const photoModel = require('../photo_model');
    photoModel.getFlickrPhotos.mockResolvedValueOnce([
      { media: { m: 'http://example.com/photo_m.jpg' } }
    ]);

    worker.startWorker();

    const mockStream = new EventEmitter();
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit('finish'));
    });
    mockFile.createWriteStream.mockReturnValue(mockStream);

    const message = {
      id: 'msg-media-m',
      data: Buffer.from(JSON.stringify({ tags: 'plants' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(message.ack).toHaveBeenCalled();
  });

  test('should ack immediately if message has no tags', async () => {
    worker.startWorker();

    const message = {
      id: 'msg-2',
      data: Buffer.from(JSON.stringify({})),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(message.ack).toHaveBeenCalled();
  });

  test('should handle download errors gracefully during zip creation', async () => {
    const got = require('got');
    got.get.mockRejectedValueOnce(new Error('Image 404'));

    worker.startWorker();

    const mockStream = new EventEmitter();
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit('finish'));
    });
    mockFile.createWriteStream.mockReturnValue(mockStream);

    const message = {
      id: 'msg-3',
      data: Buffer.from(JSON.stringify({ tags: 'landscape' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(message.ack).toHaveBeenCalled();
  });

  test('should nack message when processing fails', async () => {
    const photoModel = require('../photo_model');
    photoModel.getFlickrPhotos.mockRejectedValueOnce(new Error('Flickr API down'));

    worker.startWorker();

    const message = {
      id: 'msg-4',
      data: Buffer.from(JSON.stringify({ tags: 'fail' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(message.nack).toHaveBeenCalled();
  });

  test('should handle firebase save error gracefully', async () => {
    const firebase = require('../firebase');
    firebase.saveZip.mockRejectedValueOnce(new Error('Firebase DB timeout'));

    worker.startWorker();

    const mockStream = new EventEmitter();
    mockStream.end = jest.fn(() => {
      process.nextTick(() => mockStream.emit('finish'));
    });
    mockFile.createWriteStream.mockReturnValue(mockStream);

    const message = {
      id: 'msg-5',
      data: Buffer.from(JSON.stringify({ tags: 'forest' })),
      ack: jest.fn(),
      nack: jest.fn()
    };

    mockSubscription.emit('message', message);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(message.ack).toHaveBeenCalled();
  });

  test('should handle subscription errors', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    worker.startWorker();

    mockSubscription.emit('error', new Error('PubSub connection lost'));

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
