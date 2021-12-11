/// <reference types="node" />
import { Decoder } from './decode';
import { FLOAT32_OPTIONS } from './types';
export declare class Encoder extends Decoder {
    offset: number;
    encode: any;
    structuredClone: any;
    pack: any;
    saveStructures: any;
    getStructures: any;
    findCommonStringsToPack: any;
    constructor(options: any);
    useBuffer(buffer: Buffer): void;
}
export declare function addExtension(extension: any): void;
export declare const encode: any;
export { FLOAT32_OPTIONS } from './types';
export declare const NEVER: FLOAT32_OPTIONS, ALWAYS: FLOAT32_OPTIONS, DECIMAL_ROUND: FLOAT32_OPTIONS, DECIMAL_FIT: FLOAT32_OPTIONS;
export declare const REUSE_BUFFER_MODE = 1000;
