const oproto = Object.prototype;
const aproto = Array.prototype;
const serialize = oproto.toString;

export const isFunction = (fn: any): fn is Function => {
  return serialize.call(fn) === '[object Function]';
};

export const isArray = Array.isArray || 
  /* istanbul ignore next */ 
  function(ary: any): ary is any[] {
    return serialize.call(ary) === '[object Array]';
  };

export const isPlainObject = (obj: any): obj is Record<string, any> => {
  return serialize.call(obj) === '[object Object]' && Object.getPrototypeOf(obj) === oproto;
};

let i = 0;
export const utils = {
  uid: (): number => {
    return ++i;
  },
  
  noop: (): void => {},
  
  bind: function<T extends (...args: any[]) => any>(fn: T, context: any): (...args: Parameters<T>) => ReturnType<T> {
    return function(this: any, ...args: any[]): any {
      return fn.apply(context, args);
    };
  },
  
  preventEvent: (evt: Event): void => {
    evt.preventDefault();
  },
  
  stop: (evt: Event): void => {
    evt.preventDefault();
    evt.stopPropagation();
  },
  
  nextTick: function(fn: Function, context: any): void {
    setTimeout(utils.bind(fn, context), 0);
  },
  
  toArray: function<T>(ary: ArrayLike<T>, start?: number, end?: number): T[] {
    if (start === undefined) start = 0;
    if (end === undefined) end = ary.length;
    return aproto.slice.call(ary, start, end);
  },

  isPlainObject,
  isFunction,
  isArray,
  
  isObject: function(obj: any): boolean {
    return Object(obj) === obj;
  },
  
  isString: function(s: any): s is string {
    return typeof s === 'string';
  },
  
  isUndefined: function(a: any): a is undefined {
    return typeof a === 'undefined';
  },
  
  isDefined: function<T>(a: T | undefined): a is T {
    return typeof a !== 'undefined';
  },

  each: function<T>(
    ary: T[] | Record<string, T>, 
    func: (item: T, index: string | number, collection: T[] | Record<string, T>) => boolean | void,
    context?: any
  ): void {
    if (utils.isDefined((ary as any).length)) {
      for (let i = 0, len = (ary as T[]).length; i < len; i++) {
        if (func.call(context, (ary as T[])[i], i, ary as T[]) === false) {
          break;
        }
      }
    } else {
      for (const k in ary as Record<string, T>) {
        if (func.call(context, (ary as Record<string, T>)[k], k, ary as Record<string, T>) === false) {
          break;
        }
      }
    }
  },

  /**
   * If option is a function, evaluate it with given params
   * @param {*} data
   * @param {...} args arguments of a callback
   * @returns {*}
   */
  evalOpts: function<T, A extends any[]>(data: T | ((...args: A) => T), ...args: A): T {
    if (utils.isFunction(data)) {
      return (data as Function)(...args);
    }
    return data as T;
  },

  /**
   * 扩展对象属性
   * @param target 目标对象
   * @param source 源对象
   * @param deep 是否深度扩展
   */
  extend: function<T extends object, U extends object>(target: T, source: U, deep?: boolean): T & U;
  extend: function(target?: any, ...sources: any[]): any {
    let options: any;
    let name: string;
    let src: any;
    let copy: any;
    let copyIsArray: boolean;
    let clone: any;
    let target = arguments[0] || {};
    let i = 1;
    const length = arguments.length;
    let deep = false;

    // Handle a deep copy situation
    if (typeof target === 'boolean') {
      deep = target;
      // skip the boolean and the target
      target = arguments[i] || {};
      i++;
    }

    // Handle case when target is a string or something (possible in deep copy)
    if (typeof target !== 'object' && !utils.isFunction(target)) {
      target = {};
    }

    for (; i < length; i++) {
      // Only deal with non-null/undefined values
      options = arguments[i];
      if (options == null) {
        continue;
      }

      for (name in options) {
        if (!Object.prototype.hasOwnProperty.call(options, name)) {
          continue;
        }
        
        src = target[name];
        copy = options[name];

        // Prevent never-ending loop
        if (target === copy) {
          continue;
        }

        // Recurse if we're merging plain objects or arrays
        if (deep && copy && (utils.isPlainObject(copy) || (copyIsArray = utils.isArray(copy)))) {
          if (copyIsArray) {
            copyIsArray = false;
            clone = src && utils.isArray(src) ? src : [];
          } else {
            clone = src && utils.isPlainObject(src) ? src : {};
          }

          // Never move original objects, clone them
          target[name] = utils.extend(deep, clone, copy);
        } else if (copy !== undefined) {
          // Don't bring in undefined values
          target[name] = copy;
        }
      }
    }

    // Return the modified object
    return target;
  },

  defineNonEnumerable: function(target: any, key: string | Record<string, any>, value?: any): void {
    if (typeof key === 'string') {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        value
      });
    } else {
      Object.defineProperties(target, key);
    }
  }
};

export default utils;
