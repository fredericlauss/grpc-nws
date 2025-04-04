import { ServerDuplexStream, ServerWritableStream, ServerUnaryCall } from '@grpc/grpc-js';
import {
    Ack,
    StreamData,
    StreamInfo,
    StreamValidation,
    QualityDefinition,
    Resolution,
    FPS,
    Format,
    Error as ProtoError
} from '../proto/twitchy';
import crypto from 'crypto';

export class StreamService {
    private static instance: StreamService;
    private streamBuffers: Map<number, StreamData[]> = new Map();
    private readonly MAX_BUFFER_SIZE = 100;
    private readonly BATCH_SIZE = 100;
    private isStreaming: boolean = false;
    private frameQueues: Map<number, StreamData[]> = new Map();
    private processingStreams: Set<number> = new Set();
    private viewers: Map<number, Set<ServerWritableStream<StreamInfo, StreamData>>> = new Map();
    private authorizedStreams: Set<number> = new Set();
    private streamInfoMap: Map<number, StreamInfo> = new Map();

    private constructor() { }

    public static getInstance(): StreamService {
        if (!StreamService.instance) {
            StreamService.instance = new StreamService();
        }
        return StreamService.instance;
    }

    private logTimeDelta(stage: string, frameTs: number) {
        const now = Date.now() * 1000000;
        const delta = now - frameTs;
        console.log(`[${stage}] Delta: ${delta / 1000000}ms`);
    }

    private async processFrame(data: StreamData): Promise<StreamData | null> {
        this.logTimeDelta('RECEIVE', data.ts);

        if (data.video.length > 1024 * 1024 * 5) {
            console.warn(`Frame too large for stream ${data.streamId}, skipping`);
            return null;
        }

        // Initialiser le buffer si nécessaire
        if (!this.streamBuffers.has(data.streamId)) {
            this.streamBuffers.set(data.streamId, []);
        }
        const buffer = this.streamBuffers.get(data.streamId)!;

        buffer.push(data);
        while (buffer.length > this.MAX_BUFFER_SIZE) {
            buffer.shift();
        }

        this.logTimeDelta('PROCESS', data.ts);
        return data;
    }

    private async broadcastToViewers(data: StreamData): Promise<void> {
        this.logTimeDelta('EMIT', data.ts);

        const streamViewers = this.viewers.get(data.streamId);
        if (!streamViewers) return;

        const deadViewers = new Set<ServerWritableStream<StreamInfo, StreamData>>();
        const viewers = [...streamViewers];

        for (let i = 0; i < viewers.length; i += this.BATCH_SIZE) {
            const batch = viewers.slice(i, i + this.BATCH_SIZE);

            await Promise.all(batch.map(async (viewer) => {
                try {
                    await viewer.write(data);
                } catch (error) {
                    console.error(`Viewer write error for stream ${data.streamId}:`, error);
                    deadViewers.add(viewer);
                }
            }));
        }

        // Nettoyer les viewers morts
        deadViewers.forEach(viewer => {
            streamViewers.delete(viewer);
        });

        // Si plus de viewers, nettoyer la Map
        if (streamViewers.size === 0) {
            this.viewers.delete(data.streamId);
        }
    }

    private async processQueue(streamId: number) {
        if (this.processingStreams.has(streamId)) return;
        this.processingStreams.add(streamId);

        try {
            const queue = this.frameQueues.get(streamId) || [];
            while (queue.length > 0) {
                const data = queue.shift()!;
                const processedData = await this.processFrame(data);
                if (processedData) {
                    await this.broadcastToViewers(processedData);
                }
            }
        } finally {
            this.processingStreams.delete(streamId);
        }
    }

    private generateStreamId(): number {
        const streamId = crypto.randomInt(1, 2 ** 32);
        console.log('Stream ID généré:', streamId);
        return streamId;
    }

    private validateQuality(quality: QualityDefinition | undefined): boolean {
        return true;
    }

    async listStream(call: ServerWritableStream<StreamInfo, StreamInfo>): Promise<void> {
        try {
            this.authorizedStreams.forEach((streamId) => {
                const streamInfo = this.streamInfoMap.get(streamId);
                if (streamInfo) {
                    call.write(streamInfo);
                }
            });
            call.end();
        } catch (error) {
            console.error('Error in listStream:', error);
            call.emit('error', error);
        }
    }


async newStream(
  call: ServerUnaryCall<StreamInfo, StreamValidation>
): Promise<StreamValidation> {
  console.log('Traitement de la demande de stream:', call.request);
  
  // Générer un nouveau streamId, ignorer celui du client
  const streamId = this.generateStreamId();
  console.log('Nouveau streamId généré:', streamId);

  // Créer une nouvelle StreamInfo avec notre streamId
  const streamInfo = {
    ...call.request,
    streamId: streamId  // Remplacer l'ID du client par le nôtre
  };
  
  // Stocker les infos du stream
  this.streamInfoMap.set(streamId, streamInfo);
  this.authorizedStreams.add(streamId);

  console.log('Streams autorisés:', Array.from(this.authorizedStreams));

  return {
    streamId: streamId,  // Retourner notre ID
    error: ProtoError.error_undefined,
    video: [call.request.videoquality!],
    audio: [call.request.audioquality!]
  };
}

    async sendStream(call: ServerDuplexStream<StreamData, Ack>): Promise<void> {
        const firstFrame = await new Promise<StreamData>((resolve) => {
            call.once('data', resolve);
        });

        if (!this.authorizedStreams.has(firstFrame.streamId)) {
            call.emit('error', new Error('Unauthorized stream ID'));
            call.end();
            return;
        }

        try {
            this.isStreaming = true;
            const streamId = firstFrame.streamId;

            call.on('data', async (data: StreamData) => {
                call.write({
                    size: this.streamBuffers.get(streamId)?.length || 0,
                    error: 0
                });

                this.frameQueues.set(streamId, [...(this.frameQueues.get(streamId) || []), data]);
                this.processQueue(streamId).catch(console.error);
            });

            call.on('end', () => {
                this.isStreaming = false;
                this.authorizedStreams.delete(streamId);
                console.log(`Stream ${streamId} terminé`);
                call.end();
            });

            call.on('close', () => {
                this.isStreaming = false;
                this.authorizedStreams.delete(streamId);
                console.log(`Stream ${streamId} fermé`);
            });

            call.on('error', (err) => {
                console.error('Stream error:', err);
                this.isStreaming = false;
                this.authorizedStreams.delete(streamId);
            });

        } catch (error) {
            console.error('Fatal error:', error);
            call.emit('error', error);
            this.isStreaming = false;
            this.authorizedStreams.delete(firstFrame.streamId);
        }
    }

    private logViewerCount() {
        const count = this.viewers.size;
        console.log(`[Viewers] Total: ${count}`);
    }

    async getStream(call: ServerWritableStream<StreamInfo, StreamData>): Promise<void> {
        const streamId = call.request.streamId;
        
        if (!this.authorizedStreams.has(streamId)) {
            call.emit('error', new Error('Stream not found'));
            return;
        }

        try {
            // Initialiser le set de viewers si nécessaire
            if (!this.viewers.has(streamId)) {
                this.viewers.set(streamId, new Set());
            }
            const streamViewers = this.viewers.get(streamId)!;
            streamViewers.add(call);

            // Envoyer le buffer existant
            const buffer = this.streamBuffers.get(streamId) || [];
            for (const frame of buffer) {
                await call.write(frame);
            }

            call.on('end', () => {
                streamViewers.delete(call);
                if (streamViewers.size === 0) {
                    this.viewers.delete(streamId);
                }
                call.end();
            });

            call.on('error', () => {
                streamViewers.delete(call);
                if (streamViewers.size === 0) {
                    this.viewers.delete(streamId);
                }
            });

        } catch (error) {
            console.error(`Stream error for ${streamId}:`, error);
            call.emit('error', error);
        }
    }
}
