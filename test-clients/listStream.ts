import * as grpc from '@grpc/grpc-js';
import { StreamInfo, TwitchyClient } from '../src/proto/twitchy';

const client = new TwitchyClient('localhost:3000', grpc.credentials.createInsecure());

const request = StreamInfo.create();

const stream = client.listStream(request);

stream.on('data', (response: StreamInfo) => {
  console.log('Stream Info:', response);
});

stream.on('end', () => {
  console.log('Fin de la liste des streams.');
});

stream.on('error', (err) => {
  console.error('Erreur:', err);
});
