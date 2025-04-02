import { ServerDuplexStream, ServerWritableStream } from '@grpc/grpc-js';
import { Ack, StreamData, StreamDataClient, StreamRequest } from '../proto/twitchy';
import { EventEmitter } from 'events';

export class StreamService {
  private streamBuffer: StreamData[] = [];
  private readonly streamEmitter = new EventEmitter();
  private readonly MAX_BUFFER_SIZE = 100; // Garde les 100 derniers frames

  async sendStream(call: ServerDuplexStream<StreamData, Ack>): Promise<void> {
    try {
      // Quand on reçoit des données du streamer
      call.on('data', async (data: StreamData) => {
        // Stocke la frame dans le buffer
        this.streamBuffer.push(data);
        
        // Garde uniquement les N dernières frames
        if (this.streamBuffer.length > this.MAX_BUFFER_SIZE) {
          this.streamBuffer.shift();
        }

        // Émet la frame pour tous les viewers
        this.streamEmitter.emit('newFrame', data);

        // Confirme la réception au streamer
        call.write({
          size: this.streamBuffer.length,
          error: 0
        });
      });

      call.on('end', () => {
        call.end();
      });

    } catch (error) {
      console.error('Error in sendStream:', error);
      call.emit('error', error);
    }
  }

  async getStream(call: ServerWritableStream<StreamRequest, StreamDataClient>): Promise<void> {
    try {
      // Envoie le buffer existant au nouveau viewer
      for (const frame of this.streamBuffer) {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      }

      // Écoute les nouvelles frames et les envoie au viewer
      const newFrameListener = (frame: StreamData) => {
        call.write({
          ts: frame.ts,
          audio: frame.audio,
          video: frame.video
        });
      };

      this.streamEmitter.on('newFrame', newFrameListener);

      // Nettoie le listener quand le viewer se déconnecte
      call.on('end', () => {
        this.streamEmitter.off('newFrame', newFrameListener);
        call.end();
      });

    } catch (error) {
      console.error('Error in getStream:', error);
      call.emit('error', error);
    }
  }
}