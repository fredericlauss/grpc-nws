import { ServerDuplexStream, ServerWritableStream } from '@grpc/grpc-js';
import { Ack, StreamData, StreamDataClient, StreamRequest } from '../proto/twitchy';
import { EventEmitter } from 'events';
import { StreamHandler } from './streamHandler';

export class StreamService {
    private static instance: StreamService;
    private streams: Map<string, StreamHandler>;

    private constructor() {
        this.streams = new Map();
    }

    public static getInstance(): StreamService {
        if (!StreamService.instance) {
            StreamService.instance = new StreamService();
        }
        return StreamService.instance;
    }

    async sendStream(call: ServerDuplexStream<StreamData, Ack>): Promise<void> {
        const streamId = call.metadata.get('streamId')[0] as string; // Récupérer le streamId depuis les métadonnées
        if (!streamId) {
            console.error('Missing streamId');
            call.end();
            return;
        }

        if (!this.streams.has(streamId)) {
            this.streams.set(streamId, new StreamHandler());
        }

        const streamHandler = this.streams.get(streamId)!;
        console.log(`New streamer connected on stream ${streamId}`);

        call.on('data', async (data: StreamData) => {
            const result = await streamHandler.handleIncomingStream(data);
            streamHandler.emitNewFrame(data);

            call.write({
                size: result.size,
                error: 0
            });
        });

        call.on('end', () => {
            console.log(`Streamer disconnected from stream ${streamId}`);
            this.streams.delete(streamId); // Supprimer le stream une fois le streamer parti
            call.end();
        });
    }

    async getStream(call: ServerWritableStream<StreamRequest, StreamDataClient>): Promise<void> {
        const streamId = call.metadata.get('streamId')[0] as string;
        if (!streamId || !this.streams.has(streamId)) {
            console.error(`Stream ${streamId} not found`);
            call.end();
            return;
        }

        const streamHandler = this.streams.get(streamId)!;
        console.log(`New viewer connected to stream ${streamId}`);

        const newFrameListener = (frame: StreamData) => {
            call.write({
                ts: frame.ts,
                audio: frame.audio,
                video: frame.video
            });
        };

        streamHandler.addViewer(newFrameListener);

        call.on('end', () => {
            console.log(`Viewer disconnected from stream ${streamId}`);
            streamHandler.removeViewer(newFrameListener);
            call.end();
        });

        call.on('close', () => {
            console.log(`Viewer forcibly disconnected from stream ${streamId}`);
            streamHandler.removeViewer(newFrameListener);
        });
    }
}
