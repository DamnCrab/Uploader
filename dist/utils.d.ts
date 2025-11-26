export declare const isFunction: (fn: any) => fn is Function;
export declare const isArray: (arg: any) => arg is any[];
export declare const isPlainObject: (obj: any) => obj is Record<string, any>;
export declare const utils: {
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
    /**
     * If option is a function, evaluate it with given params
     * @param {*} data
     * @param {...} args arguments of a callback
     * @returns {*}
     */
    evalOpts: <T, A extends any[]>(data: T | ((...args: A) => T), ...args: A) => T;
    /**
     * 扩展对象属性
     * @param target 目标对象
     * @param source 源对象
     * @param deep 是否深度扩展
     */
    extend: (target?: any, ...sources: any[]) => any;
    defineNonEnumerable: (target: any, key: string | Record<string, any>, value?: any) => void;
};
export default utils;
