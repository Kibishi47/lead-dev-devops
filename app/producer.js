require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');

const projectId = 'ecni2-2026';
const pubSubClient = new PubSub({ projectId });

async function publishMessage(tags) {
  const studentId = process.env.ECNI2_STUDENT_ID || '1';
  const topicName = `ecni2-${studentId}`;

  const dataBuffer = Buffer.from(JSON.stringify({ tags }));

  try {
    const messageId = await pubSubClient
      .topic(topicName)
      .publishMessage({ data: dataBuffer });
    console.log(`Message ${messageId} publié sur le topic ${topicName}`);
    return messageId;
  } catch (error) {
    console.error(`Erreur lors de la publication sur ${topicName}:`, error);
    throw error;
  }
}

module.exports = {
  publishMessage
};
