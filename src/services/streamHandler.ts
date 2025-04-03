import { EventEmitter } from 'events';
import { StreamData, StreamDataClient } from '../proto/twitchy';

export class StreamHandler {
    private streamBuffer: Map<number, StreamData>;
    private readonly maxBufferSize = 100;
    private streamEmitter: EventEmitter;
    private viewerCount: number = 0;

    constructor() {
        this.streamBuffer = new Map();
        this.streamEmitter = new EventEmitter();
    }

    async handleIncomingStream(data: StreamData): Promise<{ size: number }> {
        this.streamBuffer.set(Number(data.ts), data);

        if (this.streamBuffer.size > this.maxBufferSize) {
            const oldestKey = Math.min(...this.streamBuffer.keys());
            this.streamBuffer.delete(oldestKey);
        }

        return { size: this.streamBuffer.size };
    }

    emitNewFrame(data: StreamData) {
        this.streamEmitter.emit('newFrame', data);
    }

    addViewer(listener: (frame: StreamData) => void) {
        this.viewerCount++;
        this.streamEmitter.on('newFrame', listener);
    }

    removeViewer(listener: (frame: StreamData) => void) {
        this.viewerCount = Math.max(0, this.viewerCount - 1);
        this.streamEmitter.off('newFrame', listener);
    }
}
