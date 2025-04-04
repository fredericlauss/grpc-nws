import * as grpc from '@grpc/grpc-js';
import { TwitchyClient, StreamData, StreamInfo, StreamValidation, QualityDefinition, Resolution, FPS, Format } from '../src/proto/twitchy';

async function main() {
  const client = new TwitchyClient(
    'localhost:3000',
    grpc.credentials.createInsecure()
  );

  const streamRequest: StreamInfo = {
    videoquality: {
      format: Format.mp4,
      resolution: Resolution.x240p,
      fps: FPS.x30,
      bitrate: 1000
    },
    audioquality: {
      format: Format.aac,
      resolution: Resolution.res_undefined,
      fps: FPS.fps_undefined,
      bitrate: 128
    },
    streamId: 10 // sera assigné par le serveur
  };

  const validation = await new Promise<StreamValidation>((resolve, reject) => {
    client.newStream(streamRequest, (error, response) => {
      if (error) {
        console.error('Erreur lors de la demande:', error);
        reject(error);
      } else {
        resolve(response);
      }
    });
  });

  if (validation.error !== 0) {
    console.error('Stream non autorisé:', validation);
    return;
  }


  // 2. Démarrer le stream avec l'ID reçu
  const stream = client.sendStream();
  let frameCount = 0;

  const interval = setInterval(() => {
    const frame: StreamData = {
      ts: Date.now(),
      streamId: validation.streamId, // Utiliser l'ID reçu
      audio: Buffer.from(`Audio frame ${frameCount}`),
      video: Buffer.from(`Video frame ${frameCount}`),
      streamTitle: 'Test Stream'
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

  process.on('SIGINT', () => {
    clearInterval(interval);
    stream.end();
    process.exit();
  });
}

main().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
}); 