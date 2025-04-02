import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from './config';

const packageDefinition = protoLoader.loadSync('./src/proto/twitchy.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = (grpc.loadPackageDefinition(
  packageDefinition
) as unknown as {
    twitchy: {
      Twitchy: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>
    }
  }).twitchy;

function main() {
  const server = new grpc.Server();
  


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