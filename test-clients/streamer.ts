import * as grpc from '@grpc/grpc-js';
import { TwitchyClient } from '../src/proto/twitchy';
import { StreamData } from '../src/proto/twitchy';

async function main() {
  const client = new TwitchyClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
  );

  const stream = client.sendStream();

  let frameCount = 0;
  const interval = setInterval(() => {
    const frame: StreamData = {
      ts: Date.now(),
      audio: Buffer.from(`Audio frame ${frameCount}`),
      video: Buffer.from(`Video frame ${frameCount}`),
    };

    stream.write(frame);
    console.log(`Sent frame ${frameCount}`);
    frameCount++;
  }, 1000);

  stream.on('data', (ack) => {
    console.log('Received ack:', ack);
  });

  stream.on('error', (error) => {
    console.error('Stream error:', error);
    clearInterval(interval);
  });

  // Cleanup à la fin
  process.on('SIGINT', () => {
    clearInterval(interval);
    stream.end();
    process.exit();
  });
}

main().catch(console.error); 