import { SessionInstance } from './instance.js';

export function registerBrowserClient(this: SessionInstance) {
  if (!this.clientWs) {
    return;
  }

  this.clientWs.addEventListener('message', async (event) => {
    if (event.data instanceof Buffer) {
      this.sendMessageForTranscription(event.data);
    } else {
      try {
        if (event.data === 'ping') {
          this.clientWs?.send('pong');
        }

        if (event.data === 'get:session') {
          this.clientWs?.send(`session:${this.sessionId}`);
          return;
        }
      } catch (e) {
        console.error('Error processing message from client:', e);
      }
    }
  });

  this.clientWs.addEventListener('close', (event) => {
    if (event.code !== 1000) {
      this.log('Client WebSocket closed with error:', event.code, event.reason);
      this.clientWs = null;

      // Allow 15s for reconnect
      setTimeout(() => {
        if (!this.clientWs) {
          this.cleanupConnections(
            `Client disconnected (timeout): ${event.code} ${event.reason}`
          );
        }
      }, 1000 * 15);
      return;
    }

    this.log('Client WebSocket closed:', event.code, event.reason);

    // Important: When the client disconnects, close the connection to the 3rd party.
    this.cleanupConnections(
      `Client disconnected: ${event.code} ${event.reason}`
    );
  });

  this.clientWs.addEventListener('error', (error) => {
    console.error('Client WebSocket error:', error);

    // this.ctx.storage.setAlarm(
    //   Date.now() + 1000 * 60 // 1 minute
    // );

    // Let client attempt to reconnect

    // this.cleanupConnections('Client connection error');
  });
}
