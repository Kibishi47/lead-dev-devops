const mockPublishMessage = jest.fn();
const mockTopic = jest.fn(() => ({
  publishMessage: mockPublishMessage
}));

jest.mock('dotenv', () => ({
  config: jest.fn()
}));

jest.mock('@google-cloud/pubsub', () => {
  return {
    PubSub: jest.fn().mockImplementation(() => ({
      topic: mockTopic
    }))
  };
});

describe('producer.js', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockTopic.mockClear();
    mockPublishMessage.mockReset();
    process.env = Object.assign({}, originalEnv);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('publishMessage should fallback to studentId=1 when ECNI2_STUDENT_ID is missing', async () => {
    delete process.env.ECNI2_STUDENT_ID;
    mockPublishMessage.mockResolvedValue('msg-12345');
    const producer = require('../producer');

    const result = await producer.publishMessage('paris');
    expect(result).toBe('msg-12345');
    expect(mockTopic).toHaveBeenCalledWith('ecni2-1');
    expect(mockPublishMessage).toHaveBeenCalledWith({
      data: Buffer.from(JSON.stringify({ tags: 'paris' }))
    });
  });

  test('publishMessage should use custom ECNI2_STUDENT_ID when provided', async () => {
    process.env.ECNI2_STUDENT_ID = '42';
    mockPublishMessage.mockResolvedValue('msg-67890');
    const producer = require('../producer');

    const result = await producer.publishMessage('lyon');
    expect(result).toBe('msg-67890');
    expect(mockTopic).toHaveBeenCalledWith('ecni2-42');
  });


  test('publishMessage should throw error when pubsub publish fails', async () => {
    mockPublishMessage.mockRejectedValue(new Error('GCP PubSub Error'));
    const producer = require('../producer');

    await expect(producer.publishMessage('paris')).rejects.toThrow('GCP PubSub Error');
  });
});
