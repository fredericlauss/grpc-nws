import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from './config';
import { StreamService } from './services/streamService';

const packageDefinition = protoLoader.loadSync('./src/proto/twitchy.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = (grpc.loadPackageDefinition(
  packageDefinition
) as any).twitchy;

function main() {
  const server = new grpc.Server();
  const streamService = StreamService.getInstance();
  
  server.addService(proto.Twitchy.service, {
    newStream: async (call: any, callback: any) => {
      console.log('Nouvelle demande de stream reçue');
      try {
        const response = await streamService.newStream(call);
        console.log('Envoi de la réponse:', response);
        callback(null, response);
      } catch (error) {
        console.error('Erreur newStream:', error);
        callback(error);
      }
    },
    sendStream: (call: any) => {
      console.log('Nouvelle connexion de stream');
      return streamService.sendStream(call);
    },
    getLogs: (call: any) => streamService.getLogs(call),
    getStream: (call: any) => {
      console.log('Nouveau viewer connecté');
      return streamService.getStream(call);
    },
    listStream: (call: any) => streamService.listStream(call)
  });

  server.bindAsync(
    `0.0.0.0:${config.port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error(`Server failed to start: ${error}`);
        return;
      }
      server.start();
      console.log(`Server running on port ${port}`);
    }
  );
}

main();