import { EventEmitter } from 'events';
import { StreamData, StreamDataClient } from '../proto/twitchy';

export class StreamHandler {
  private streamBuffer: Map<number, StreamData>;
  private readonly maxBufferSize = 10000;

  constructor() {
    this.streamBuffer = new Map();
  }

  async handleIncomingStream(data: StreamData): Promise<{ size: number }> {
    this.streamBuffer.set(Number(data.ts), data);
    
    if (this.streamBuffer.size > this.maxBufferSize) {
      const oldestKey = Math.min(...this.streamBuffer.keys());
      this.streamBuffer.delete(oldestKey);
    }

    return { size: this.streamBuffer.size };
  }

  private getLatestStreamData(): StreamDataClient | null {
    if (this.streamBuffer.size === 0) return null;
    
    const latestKey = Math.max(...this.streamBuffer.keys());
    const latestData = this.streamBuffer.get(latestKey);
    
    return latestData ? {
      ts: latestData.ts,
      audio: latestData.audio,
      video: latestData.video
    } : null;
  }
}