import * as grpc from '@grpc/grpc-js';
import { StreamData, TwitchyClient } from '../src/proto/twitchy';

async function main() {
  console.log('Démarrage du viewer...');
  const client = new TwitchyClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
  );

  // Attendre un peu pour laisser le temps au streamer de démarrer
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Connexion au stream...');
  const stream = client.getStream({
    videoquality: undefined,
    audioquality: undefined,
    streamId: 1144611655 // Assurez-vous que c'est le même ID que le streamer
  });

  stream.on('data', (frame: StreamData) => {
    console.log('Received frame:', {
      ts: frame.ts,
      size: `${(frame.video.length / 1024 / 1024).toFixed(2)}MB`,
      streamId: frame.streamId
    });
  });

  stream.on('error', (error: Error) => {
    console.error('Stream error:', error);
  });

  stream.on('end', () => {
    console.log('Stream ended');
  });

  console.log('Viewer connecté et en attente de frames...');

  process.on('SIGINT', () => {
    console.log('Arrêt du viewer...');
    stream.cancel();
    process.exit();
  });
}

main().catch(console.error); 