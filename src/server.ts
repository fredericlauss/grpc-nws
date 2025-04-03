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
    sendStream: (call: any) => streamService.sendStream(call),
    getStream: (call: any) => streamService.getStream(call)
  });

  server.bindAsync(
    `0.0.0.0:${config.port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error(`Serverr failed to start: ${error}`);
        return;
      }
      server.start();
      console.log(`Server running on port ${port}`);
    }
  );
}

main();