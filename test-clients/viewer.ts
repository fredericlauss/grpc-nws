import * as grpc from '@grpc/grpc-js';
import { TwitchyClient } from '../src/proto/twitchy';

async function main() {
  const client = new TwitchyClient(
    'localhost:3000', 
    grpc.credentials.createInsecure()
  );

  const stream = client.getStream({
    dummy: 1
  });

  stream.on('data', (frame) => {
    console.log('Received frame:', {
      timestamp: frame.ts,
      audioContent: frame.audio.toString(),
      videoContent: frame.video.toString()
    });
  });

  stream.on('end', () => {
    console.log('Stream ended');
  });

  stream.on('error', (error) => {
    console.error('Stream error:', error);
  });

  console.log('Viewer connected and waiting for frames...');

  process.on('SIGINT', () => {
    console.log('Shutting down viewer...');
    stream.cancel();
    process.exit();
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
}); 