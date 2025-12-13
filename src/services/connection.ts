import { saveCaptionsToDatabase } from './db.js';
import { SessionInstance } from './instance.js';

export async function closeConnections(this: SessionInstance, reason: string) {
  if (this.closing) {
    return;
  }

  this.closing = true;

  try {
    this.onCleanup();
  } catch (e) {
    this.log('Error during cleanup:', e);
  }

  const now = Date.now();
  const duration = (now - this.createdAt) / 1000;
  this.log(`Cleaning up connections: ${reason}`);
  this.log(`Session duration: ${Math.floor(duration)}s`);

  try {
    this.clientWs?.close(1000, `DO closing: ${reason}`);
  } catch (e) {
    this.log('Error closing client WS:', e);
  }

  try {
    this.speechToText?.close();
  } catch (e) {
    this.log('Error closing external WS:', e);
  }

  await saveCaptionsToDatabase
    .call(this)
    .then(() => {
      this.log('Caption save complete.');
    })
    .catch((err) => {
      // Catch errors from saveCaptionsToDatabase here to prevent
      // waitUntil from potentially masking the error if not handled inside.
      this.log('waitUntil caught an error during saveCaptionsToDatabase:', err);
    });
}
