import * as grpc from '@grpc/grpc-js';
import { LogsInfo, LogData, TwitchyClient, LogLevel } from '../src/proto/twitchy';

async function main() {
    const client = new TwitchyClient(
        'localhost:3000',
        grpc.credentials.createInsecure()
    );

    const request: LogsInfo = {
        level: LogLevel.info,
        streamId: [4127204080]
    };

    const stream = client.getLogs(request);

    stream.on('data', (log: LogData) => {
        console.log('Received log:', log);
    });

    stream.on('end', () => {
        console.log('Fin des logs.');
    });

    stream.on('error', (error) => {
        console.error('Erreur:', error);
    });
}

main().catch(console.error);