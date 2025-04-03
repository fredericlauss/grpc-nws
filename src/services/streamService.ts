import { ServerDuplexStream, ServerWritableStream } from '@grpc/grpc-js';
import { Ack, StreamData, StreamDataClient, StreamRequest } from '../proto/twitchy';

export class StreamService {
  private static instance: StreamService;
  private streamBuffer: StreamData[] = [];
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly BATCH_SIZE = 100;
  private isStreaming: boolean = false;
  private frameQueue: StreamData[] = [];
  private isProcessing = false;
  private viewers: Set<ServerWritableStream<StreamRequest, StreamDataClient>> = new Set();

  private constructor() {}

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
      console.warn('Frame too large, skipping');
      return null;
    }

    this.streamBuffer.push(data);
    while (this.streamBuffer.length > this.MAX_BUFFER_SIZE) {
      this.streamBuffer.shift();
    }

    this.logTimeDelta('PROCESS', data.ts);
    return data;
  }

  private async broadcastToViewers(data: StreamData): Promise<void> {
    this.logTimeDelta('EMIT', data.ts);
    
    const deadViewers = new Set<ServerWritableStream<StreamRequest, StreamDataClient>>();
    const viewers = [...this.viewers];
    
    for (let i = 0; i < viewers.length; i += this.BATCH_SIZE) {
      const batch = viewers.slice(i, i + this.BATCH_SIZE);
      
      await Promise.all(batch.map(async (viewer) => {
        try {
          await viewer.write({
            ts: data.ts,
            audio: data.audio,
            video: data.video
          });
        } catch (error) {
          console.error('Viewer write error:', error);
          deadViewers.add(viewer);
        }
      }));
    }

    // Nettoyage des viewers morts
    for (const viewer of deadViewers) {
      this.viewers.delete(viewer);
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.frameQueue.length > 0) {
      const data = this.frameQueue.shift()!;
      const processedData = await this.processFrame(data);
      if (processedData) {
        await this.broadcastToViewers(processedData);
      }
    }

    this.isProcessing = false;
  }

  async sendStream(call: ServerDuplexStream<StreamData, Ack>): Promise<void> {
    if (this.isStreaming) {
      call.emit('error', new Error('A stream is already in progress'));
      call.end();
      return;
    }

    try {
      this.isStreaming = true;
      
      call.on('data', async (data: StreamData) => {
        call.write({
          size: this.streamBuffer.length,
          error: 0
        });

        this.frameQueue.push(data);
        this.processQueue().catch(console.error);
      });

      call.on('end', () => {
        this.isStreaming = false;
        call.end();
      });

      call.on('close', () => {
        this.isStreaming = false;
        call.end();
      });

      call.on('error', (err) => {
        console.error('Stream error:', err);
        this.isStreaming = false;
      });

    } catch (error) {
      console.error('Fatal error:', error);
      call.emit('error', error);
      this.isStreaming = false;
    }
  }

  private logViewerCount() {
    const count = this.viewers.size;
    console.log(`[Viewers] Total: ${count}`);
  }

  async getStream(call: ServerWritableStream<StreamRequest, StreamDataClient>): Promise<void> {
    try {
      this.viewers.add(call);
      this.logViewerCount();
      
      // Envoyer le buffer existant
      for (const frame of this.streamBuffer) {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      }

      call.on('end', () => {
        this.viewers.delete(call);
        this.logViewerCount();
        call.end();
      });

      call.on('close', () => {
        this.viewers.delete(call);
        this.logViewerCount();
      });

    } catch (error) {
      console.error('Stream error:', error);
      this.viewers.delete(call);
      this.logViewerCount();
      call.emit('error', error);
    }
  }
}
