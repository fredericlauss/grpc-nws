import { ServerDuplexStream, ServerWritableStream } from '@grpc/grpc-js';
import { Ack, StreamData, StreamDataClient, StreamRequest } from '../proto/twitchy';
import { EventEmitter } from 'events';

export class StreamService {
  private static instance: StreamService;
  private streamBuffer: StreamData[] = [];
  private readonly streamEmitter: EventEmitter;
  private readonly MAX_BUFFER_SIZE = 10000;
  private viewerCount: number = 0;
  private isStreaming: boolean = false;

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

  async sendStream(call: ServerDuplexStream<StreamData, Ack>): Promise<void> {
    if (this.isStreaming) {
      console.log('A stream is already active. Rejecting new stream request.');
      call.emit('error', new Error('A stream is already in progress. Only one stream allowed at a time.'));
      call.end();
      return;
    }

    try {
      this.isStreaming = true;
      console.log('New streamer connected');
      
      call.on('data', async (data: StreamData) => {
        console.time('Total frame processing');
        
        console.time('Size check');
        if (data.video.length > 1024 * 1024 * 5) {
          console.warn('Frame too large, skipping');
          console.timeEnd('Size check');
          console.timeEnd('Total frame processing');
          return;
        }
        console.timeEnd('Size check');

        console.time('Timestamp processing');
        const ts = typeof data.ts === 'number' ? 
          Math.floor(data.ts / 1000) : 
          Math.floor(Date.now() / 1000);

        const safeData: StreamData = {
          ...data,
          ts: ts
        };
        console.timeEnd('Timestamp processing');

        console.time('Buffer management');
        this.streamBuffer.push(safeData);
        while (this.streamBuffer.length > this.MAX_BUFFER_SIZE) {
          this.streamBuffer.shift();
        }
        console.timeEnd('Buffer management');

        console.time('Event emission');
        console.log(`Emitting frame, timestamp: ${ts}, buffer size: ${this.streamBuffer.length}, frame size: ${data.video.length / 1024 / 1024}MB`);
        this.streamEmitter.emit('newFrame', safeData);
        console.timeEnd('Event emission');

        console.time('Response write');
        call.write({
          size: this.streamBuffer.length,
          error: 0
        });
        console.timeEnd('Response write');

        console.timeEnd('Total frame processing');
      });

      call.on('end', () => {
        console.log('Streamer disconnected');
        this.isStreaming = false;
        call.end();
      });

      call.on('close', () => {
        console.log('Streamer disconnected');
        this.isStreaming = false;
        call.end();
      });

      call.on('error', (err) => {
        console.error('Streamer encountered an error:', err);
        this.isStreaming = false;
      });

    } catch (error) {
      console.error('Error in sendStream:', error);
      call.emit('error', error);
      this.isStreaming = false;
    }
  }

  async getStream(call: ServerWritableStream<StreamRequest, StreamDataClient>): Promise<void> {
    try {
      console.log('New viewer connected');
      this.viewerCount++;
      
      console.log(`Sending ${this.streamBuffer.length} buffered frames`);
      for (const frame of this.streamBuffer) {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      }

      const newFrameListener = (frame: StreamData) => {
        console.log(`Sending new frame to ${this.viewerCount} viewers`);
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      };

      this.streamEmitter.on('newFrame', newFrameListener);

      call.on('end', () => {
        console.log('Viewer disconnected');
        this.viewerCount--;
        this.streamEmitter.off('newFrame', newFrameListener);
        call.end();
      });

      call.on('close', () => {
        console.log('Viewer disconnected (close event)');
        this.viewerCount--;
        this.streamEmitter.off('newFrame', newFrameListener);
      });

    } catch (error) {
      console.error('Error in getStream:', error);
      call.emit('error', error);
    }
  }
}
