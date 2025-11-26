export interface UploaderOptions {
    chunkSize: number;
    forceChunkSize: boolean;
    simultaneousUploads: number;
    singleFile: boolean;
    fileParameterName: string;
    progressCallbacksInterval: number;
    speedSmoothingFactor: number;
    query: Record<string, any>;
    headers: Record<string, string>;
    withCredentials: boolean;
    preprocess: ((chunk: any) => void) | null;
    method: string;
    testMethod: string;
    uploadMethod: string;
    prioritizeFirstAndLastChunk: boolean;
    allowDuplicateUploads: boolean;
    target: string;
    testChunks: boolean;
    generateUniqueIdentifier: ((file: File | any) => string) | null;
    maxChunkRetries: number;
    chunkRetryInterval: number | null;
    permanentErrors: number[];
    successStatuses: number[];
    onDropStopPropagation: boolean;
    initFileFn: ((file: any) => void) | null;
    readFileFn: (fileObj: any, fileType: string, startByte: number, endByte: number, chunk: any) => void;
    checkChunkUploadedByResponse: ((chunk: any, message: any) => boolean) | null;
    initialPaused: boolean;
    processResponse: (response: any, cb: (err: Error | null, responseObj?: any) => void) => void;
    processParams: (params: Record<string, any>) => Record<string, any>;
}
export interface FileObject {
    file: File;
    size: number;
    uniqueIdentifier: string;
    relativePath?: string;
    webkitRelativePath?: string;
    fileName?: string;
    name: string;
}
export interface ChunkOptions {
    offset: number;
    callback?: (error?: Error | null, chunk?: any) => void;
    processFn?: (chunk: any) => void;
    readFn?: (fileObj: any, fileType: string, startByte: number, endByte: number, chunk: any) => void;
}
export interface EventTarget {
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
}
export interface EventMap {
    [key: string]: Array<(...args: any[]) => boolean>;
}
export type EventCallback = (...args: any[]) => boolean;
