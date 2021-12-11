/// <reference types="node" />
import { FLOAT32_OPTIONS, Options } from "./types";
export declare class Decoder {
    sharedValues: any;
    maxPrivatePackedValues: any;
    pack: any;
    int64AsNumber?: boolean;
    useTag259ForMaps: any;
    useFloat32?: FLOAT32_OPTIONS;
    useRecords?: boolean;
    structures?: {}[];
    structuredClone?: boolean;
    mapsAsObjects?: boolean;
    variableMapSize?: boolean;
    copyBuffers?: boolean;
    useTimestamp32?: boolean;
    largeBigIntToFloat?: boolean;
    encodeUndefinedAsNil?: boolean;
    maxSharedStructures?: number;
    maxOwnStructures?: number;
    shouldShareStructure?: (keys: string[]) => boolean;
    getStructures?(): {}[];
    saveStructures?(structures: {}[]): boolean | void;
    constructor(options: Options);
    decode(source: any, end: any): any;
    decodeMultiple(source: Buffer | Uint8Array, forEach?: (value: any) => any): [] | void;
}
export declare function getPosition(): number;
export declare function checkedRead(): any;
export declare function read(): any;
export declare let isNativeAccelerationEnabled: boolean;
export declare function setExtractor(extractStrings: any): void;
export declare class Tag {
    value: any;
    constructor(value: any);
}
export declare const typedArrays: string[];
export declare function clearSource(): void;
export declare function addExtension(extension: any): void;
export declare const mult10: any[];
export declare const decode: (source: any, end: any) => any;
export declare const decodeMultiple: (source: Buffer | Uint8Array, forEach?: (value: any) => any) => [] | void;
export { FLOAT32_OPTIONS } from './types';
export declare function roundFloat32(float32Number: any): number;
