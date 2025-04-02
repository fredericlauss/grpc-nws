import * as grpc from '@grpc/grpc-js';
import { TwitchyClient } from '../src/proto/twitchy';

async function main() {
  // Création du client avec le même port que le streamer
  const client = new TwitchyClient(
    'localhost:3000',  // Même port que le streamer
    grpc.credentials.createInsecure()
  );

  // Demande de stream
  const stream = client.getStream({
    dummy: 1
  });

  // Réception des frames avec plus de logs
  stream.on('data', (frame) => {
    console.log('Received frame:', {
      timestamp: frame.ts,
      audioContent: frame.audio.toString(),
      videoContent: frame.video.toString()
    });
  });

  // Ajout de plus de logs pour le debug
  stream.on('end', () => {
    console.log('Stream ended');
  });

  stream.on('error', (error) => {
    console.error('Stream error:', error);
  });

  // Log pour confirmer que la connexion est établie
  console.log('Viewer connected and waiting for frames...');

  // Cleanup à la fin
  process.on('SIGINT', () => {
    console.log('Shutting down viewer...');
    stream.cancel();
    process.exit();
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
}); 