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
    // if (event.code !== 1000) {
    //   if (event.code === 1001) {
    //     console.log('Durable object going away.', event.code, event.reason);
    //   } else {
    //     console.warn(`Client connection closed.`, event.code, event.reason);
    //   }
    //   console.log('Attempt reconnection');

    //   this.ctx.storage.setAlarm(
    //     Date.now() + 1000 * 60 // 1 minute
    //   );

    //   // Set up alarm to save captions and close connections
    //   return;
    // }

    console.log('Client WebSocket closed:', event.code, event.reason);

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
