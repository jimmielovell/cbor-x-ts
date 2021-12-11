/// <reference types="node" />
import { Transform } from 'stream';
import { Encoder } from './encode';
import { Decoder } from './decode.js';
export declare class EncoderStream extends Transform {
    encoder: Encoder;
    constructor(options?: any);
    _transform(value: any, encoding: string, callback: Function): void;
}
export declare class DecoderStream extends Transform {
    decoder: Decoder;
    incompleteBuffer: Buffer;
    constructor(options?: any);
    _transform(chunk: Buffer, encoding: string, callback: Function): void;
    getNullValue(): symbol;
}
