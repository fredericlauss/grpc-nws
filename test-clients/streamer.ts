import * as grpc from '@grpc/grpc-js';
import { TwitchyClient } from '../src/proto/twitchy';
import { StreamData } from '../src/proto/twitchy';

async function main() {
    const streamId = process.argv[2];
    if (!streamId) {
        console.error('Usage: node streamer.js <streamId>');
        process.exit(1);
    }

    const client = new TwitchyClient(
        'localhost:3000',
        grpc.credentials.createInsecure()
    );

    const metadata = new grpc.Metadata();
    metadata.set('streamId', streamId);

    const stream = client.sendStream(metadata);

    let frameCount = 0;
    const interval = setInterval(() => {
        const frame: StreamData = {
            ts: Date.now(),
            audio: Buffer.from(`Audio frame ${frameCount}`),
            video: Buffer.from(`Video frame ${frameCount}`),
        };

        stream.write(frame);
        console.log(`Sent frame ${frameCount} on stream ${streamId}`);
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

    console.log(`Streamer started on stream: ${streamId}`);
}

main().catch(console.error);
