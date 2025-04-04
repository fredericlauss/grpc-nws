import * as grpc from '@grpc/grpc-js';
import { StreamData, TwitchyClient } from '../src/proto/twitchy';

async function main() {
  const client = new TwitchyClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
  );

  const stream = client.getStream({
    videoquality: undefined,
    audioquality: undefined,
    streamId: 0
  });

  stream.on('data', (frame: StreamData) => {
    console.log('Received frame:', {
      ts: frame.ts,
      size: `${(frame.video.length / 1024 / 1024).toFixed(2)}MB`
    });
  });

  stream.on('error', (error: Error) => {
    console.error('Stream error:', error);
  });

  stream.on('end', () => {
    console.log('Stream ended');
  });

  console.log('Viewer connected and waiting for frames...');

  process.on('SIGINT', () => {
    console.log('Shutting down viewer...');
    stream.cancel();
    process.exit();
  });
}

main().catch(console.error); 