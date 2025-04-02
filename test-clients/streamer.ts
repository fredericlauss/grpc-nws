import * as grpc from '@grpc/grpc-js';
import { TwitchyClient } from '../src/proto/twitchy';
import { StreamData } from '../src/proto/twitchy';

async function main() {
  // Création du client
  const client = new TwitchyClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
  );

  // Création du stream bidirectionnel
  const stream = client.sendStream();

  // Simulation d'envoi de frames vidéo/audio
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
  }); // Envoie une frame chaque seconde

  // Réception des acquittements
  stream.on('data', (ack) => {
    console.log('Received ack:', ack);
  });

  // Gestion des erreurs
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