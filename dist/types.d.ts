export declare enum FLOAT32_OPTIONS {
    NEVER = 0,
    ALWAYS = 1,
    DECIMAL_ROUND = 3,
    DECIMAL_FIT = 4
}
export interface Options {
    int64AsNumber?: any;
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
}
export declare let isNativeAccelerationEnabled: boolean;
