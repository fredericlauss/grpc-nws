import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Types pour les messages
interface StreamData {
  ts: string;
  audio: Buffer;
  video: Buffer;
}

async function main() {
  // Charger le proto avec la même configuration que le serveur
  const packageDefinition = protoLoader.loadSync('./src/proto/twitchy.proto', {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const proto = (grpc.loadPackageDefinition(
    packageDefinition
  ) as any).twitchy;

  const client = new proto.Twitchy(
    '51.38.189.96:3000',
    grpc.credentials.createInsecure()
  );

  const stream = client.getStream({
    dummy: 1
  });

  stream.on('data', (frame: StreamData) => {
    console.log('Received frame:', {
      ts: frame.ts, // ts sera maintenant une string
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

main().catch((error: Error) => {
  console.error('Fatal error:', error);
}); 