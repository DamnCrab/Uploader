import File from './file';
import Chunk from './chunk';
import { UploaderOptions, FileObject } from './types';
declare class Uploader extends File {
    static version: string;
    static sliceName: string;
    static utils: {
        uid: () => number;
        noop: () => void;
        bind: <T extends (...args: any[]) => any>(fn: T, context: any) => (...args: Parameters<T>) => ReturnType<T>;
        preventEvent: (evt: Event) => void;
        stop: (evt: Event) => void;
        nextTick: (fn: Function, context: any) => void;
        toArray: <T>(ary: ArrayLike<T>, start?: number, end?: number) => T[];
        isPlainObject: (obj: any) => obj is Record<string, any>;
        isFunction: (fn: any) => fn is Function;
        isArray: (arg: any) => arg is any[];
        isObject: (obj: any) => boolean;
        isString: (s: any) => s is string;
        isUndefined: (a: any) => a is undefined;
        isDefined: <T>(a: T | undefined) => a is T;
        each: <T>(ary: T[] | Record<string, T>, func: (item: T, index: string | number, collection: T[] | Record<string, T>) => boolean | void, context?: any) => void;
        evalOpts: <T, A extends any[]>(data: T | ((...args: A) => T), ...args: A) => T;
        extend: (target?: any, ...sources: any[]) => any;
        defineNonEnumerable: (target: any, key: string | Record<string, any>, value?: any) => void;
    };
    static event: {
        _eventData: import("./types").EventMap | null;
        on: (name: string, func: import("./types").EventCallback) => void;
        off: (name: string, func?: import("./types").EventCallback) => void;
        trigger: (name: string, ...args: any[]) => boolean;
    };
    static File: typeof File;
    static Chunk: typeof Chunk;
    support: boolean;
    supportDirectory: boolean;
    filePaths: Record<string, File>;
    opts: UploaderOptions;
    preventEvent: (e: Event) => void;
    private _onDrop;
    static defaults: UploaderOptions;
    constructor(opts?: Partial<UploaderOptions>);
    _trigger(name: string, ...args: any[]): boolean;
    _triggerAsync(...args: any[]): void;
    addFiles(files: FileList | Array<File | FileObject>, evt?: Event): void;
    addFile(file: File | FileObject, evt?: Event): void;
    cancel(): void;
    removeFile(file: File): void;
    generateUniqueIdentifier(file: File | FileObject): string;
    getFromUniqueIdentifier(uniqueIdentifier: string): File | false;
    uploadNextChunk(preventEvents?: boolean): boolean;
    upload(preventEvents?: boolean): void;
    /**
     * should upload next chunk
     * @returns {boolean|number}
     */
    _shouldUploadNext(): boolean | number;
    /**
     * Assign a browse action to one or more DOM nodes.
     * @param domNodes DOM元素或DOM元素数组
     * @param isDirectory 是否允许选择目录
     * @param singleFile 是否单文件上传
     * @param attributes 设置input元素的自定义属性
     */
    assignBrowse(domNodes: Element | Element[] | NodeList, isDirectory?: boolean, singleFile?: boolean, attributes?: Record<string, string>): void;
    onDrop(evt: DragEvent): void;
    _parseDataTransfer(dataTransfer: DataTransfer | null, evt: Event): void;
    webkitReadDataTransfer(dataTransfer: DataTransfer, evt: Event): void;
    _assignHelper(domNodes: Element | Element[] | NodeList, handles: Record<string, EventListener>, remove?: boolean): void;
    _preventEvent(e: Event): void;
    /**
     * Assign one or more DOM nodes as a drop target.
     * @param domNodes
     */
    assignDrop(domNodes: Element | Element[] | NodeList): void;
    /**
     * Un-assign drop event from DOM nodes
     * @param domNodes
     */
    unAssignDrop(domNodes: Element | Element[] | NodeList): void;
}
export default Uploader;
