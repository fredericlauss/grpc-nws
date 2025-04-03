import { ServerDuplexStream, ServerWritableStream } from '@grpc/grpc-js';
import { Ack, StreamData, StreamDataClient, StreamRequest } from '../proto/twitchy';
import { EventEmitter } from 'events';

export class StreamService {
  private static instance: StreamService;
  private streamBuffer: StreamData[] = [];
  private readonly streamEmitter: EventEmitter;
  private readonly MAX_BUFFER_SIZE = 100;
  private viewerCount: number = 0;
  private isStreaming: boolean = false;
  private frameQueue: StreamData[] = [];
  private isProcessing = false;

  private constructor() {
    this.streamEmitter = new EventEmitter();
    this.streamEmitter.setMaxListeners(100);
  }

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
    this.streamEmitter.emit('newFrame', data);
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

  async getStream(call: ServerWritableStream<StreamRequest, StreamDataClient>): Promise<void> {
    try {
      this.viewerCount++;
      
      for (const frame of this.streamBuffer) {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      }

      const newFrameListener = (frame: StreamData) => {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      };

      this.streamEmitter.on('newFrame', newFrameListener);

      call.on('end', () => {
        this.viewerCount--;
        this.streamEmitter.off('newFrame', newFrameListener);
        call.end();
      });

      call.on('close', () => {
        this.viewerCount--;
        this.streamEmitter.off('newFrame', newFrameListener);
      });

    } catch (error) {
      console.error('Stream error:', error);
      call.emit('error', error);
    }
  }
}
