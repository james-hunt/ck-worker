import { wsIsOpen } from '../lib.js';
import { saveCaptionsToDatabase } from './db.js';
import { SessionInstance } from './instance.js';

export async function closeConnections(this: SessionInstance, reason: string) {
  if (this.closing) {
    return;
  }

  this.closing = true;
  console.log(`Cleaning up connections due to: ${reason}`);

  // Prevent trying to close already closed sockets
  if (wsIsOpen(this.clientWs)) {
    try {
      console.log('Closing client WS...');
      this.clientWs.close(1000, `DO closing: ${reason}`);
    } catch (e) {
      console.error('Error closing client WS:', e);
    }
  }

  // WS should be destroyed when closed
  // this.clientWs = null;

  if (wsIsOpen(this.externalWs)) {
    try {
      console.log('Closing external WS...');
      this.externalWs?.close(1000, `DO closing: ${reason}`);
    } catch (e) {
      console.error('Error closing external WS:', e);
    }
  }

  this.externalWs = null;

  console.log('Client disconnected, triggering caption save.');
  await saveCaptionsToDatabase.call(this).catch((err) => {
    // Catch errors from saveCaptionsToDatabase here to prevent
    // waitUntil from potentially masking the error if not handled inside.
    console.error(
      'waitUntil caught an error during saveCaptionsToDatabase:',
      err
    );
  });

  this.onCleanup();
}
