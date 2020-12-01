/**
 * A libp2p stream muxer
 */
export interface StreamMuxerInterface {
    readonly streams: Array<MuxedStream>;
    /**
     * Initiate a new stream with the given name. If no name is
     * provided, the id of th stream will be used.
     *
     * @param {string} [name] - If name is not a string it will be cast to one
     * @returns {Stream}
     */
    newStream(name?: string): MuxedStream;
    onStream(stream: MuxedStream): void;
    onStreamEnd(stream: MuxedStream): void;
}
export declare class Muxer implements StreamMuxerInterface {
    multicodec: string;
    readonly streams: Array<MuxedStream>;
    newStream(name?: string): MuxedStream;
    onStream(stream: MuxedStream): void;
    onStreamEnd(stream: MuxedStream): void;
}
export declare type MuxedTimeline = {
    open: number;
    close?: number;
};
export declare type MuxedStream = {
    close: () => void;
    abort: () => void;
    reset: () => void;
    sink: Sink;
    source: () => AsyncIterable<Uint8Array>;
    timeline: MuxedTimeline;
    id: string;
};
declare type Sink = (source: Uint8Array) => Promise<Uint8Array>;
export {};
