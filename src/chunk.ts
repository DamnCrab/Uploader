import utils from './utils';
import { ChunkOptions } from './types';

export class Chunk {
  public uploader: any;
  public file: any;
  public bytes: Blob | null;
  public offset: number;
  public tested: boolean;
  public retries: number;
  public pendingRetry: boolean;
  public preprocessState: number;
  public readState: number;
  public loaded: number;
  public total: number;
  public chunkSize: number;
  public startByte: number;
  public endByte: number;
  public xhr: XMLHttpRequest | null;

  static STATUS = {
    PENDING: 'pending',
    UPLOADING: 'uploading',
    READING: 'reading',
    SUCCESS: 'success',
    ERROR: 'error',
    COMPLETE: 'complete',
    PROGRESS: 'progress',
    RETRY: 'retry'
  };

  constructor(uploader: any, file: any, offset: number) {
    utils.defineNonEnumerable(this, 'uploader', uploader);
    utils.defineNonEnumerable(this, 'file', file);
    utils.defineNonEnumerable(this, 'bytes', null);
    
    this.offset = offset;
    this.tested = false;
    this.retries = 0;
    this.pendingRetry = false;
    this.preprocessState = 0;
    this.readState = 0;
    this.loaded = 0;
    this.total = 0;
    this.chunkSize = utils.evalOpts(uploader.opts.chunkSize, file, this);
    this.startByte = this.offset * this.chunkSize;
    this.endByte = this.computeEndByte();
    this.xhr = null;
  }

  _event(evt: string, ...args: any[]): void {
    args = utils.toArray(arguments);
    args.unshift(this);
    this.file._chunkEvent.apply(this.file, args);
  }

  computeEndByte(): number {
    let endByte = Math.min(this.file.size, (this.offset + 1) * this.chunkSize);
    if (this.file.size - endByte < this.chunkSize && !this.uploader.opts.forceChunkSize) {
      // The last chunk will be bigger than the chunk size,
      // but less than 2 * this.chunkSize
      endByte = this.file.size;
    }
    return endByte;
  }

  getParams(): Record<string, any> {
    return {
      chunk: this.offset,
      chunkSize: this.chunkSize,
      currentChunkSize: this.endByte - this.startByte,
      totalSize: this.file.size,
      identifier: this.file.uniqueIdentifier,
      filename: this.file.name,
      relativePath: this.file.relativePath,
      chunks: this.file.chunks.length
    };
  }

  getTarget(target: string, params: string[]): string {
    if (!params.length) {
      return target;
    }
    if (target.indexOf('?') < 0) {
      target += '?';
    } else {
      target += '&';
    }
    return target + params.join('&');
  }

  test(): void {
    this.xhr = new XMLHttpRequest();
    this.xhr.addEventListener('load', testHandler, false);
    this.xhr.addEventListener('error', testHandler, false);
    const testMethod = utils.evalOpts(this.uploader.opts.testMethod, this.file, this);
    const data = this.prepareXhrRequest(testMethod, true);
    this.xhr.send(data);

    const $ = this;
    function testHandler(event: Event): void {
      const status = $.status(true);
      if (status === Chunk.STATUS.ERROR) {
        $._event(status, $.message());
        $.uploader.uploadNextChunk();
      } else if (status === Chunk.STATUS.SUCCESS) {
        $._event(status, $.message());
        $.tested = true;
      } else if (!$.file.paused) {
        // Error might be caused by file pause method
        // Chunks does not exist on the server side
        $.tested = true;
        $.send();
      }
    }
  }

  preprocessFinished(): void {
    this.preprocessState = 2;
    this.send();
  }

  readFinished(bytes: Blob): void {
    this.readState = 2;
    this.bytes = bytes;
    this.send();
  }

  send(): void {
    const preprocess = this.uploader.opts.preprocess;
    const read = this.uploader.opts.readFileFn;
    
    if (this.preprocessState === 0) {
      this.preprocessState = 1;
      if (preprocess) {
        preprocess(this);
        return;
      } else {
        this.preprocessState = 2;
      }
    }
    
    if (this.readState === 0) {
      this.readState = 1;
      if (read && !this.file.file.slice) {
        read(this.file.file, this.file.fileType, this.startByte, this.endByte, this);
        return;
      } else {
        this.readState = 2;
      }
    }
    
    if (this.uploader.opts.testChunks && !this.tested) {
      this.test();
      return;
    }

    this.loaded = 0;
    this.total = 0;
    this.pendingRetry = false;

    const xhr = this.xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) {
        this.loaded = event.loaded;
        this.total = event.total;
      }
      this._event(Chunk.STATUS.PROGRESS, event);
    }, false);

    xhr.addEventListener('load', event => this.doneHandler(event), false);
    xhr.addEventListener('error', event => this.doneHandler(event), false);

    const uploadMethod = utils.evalOpts(this.uploader.opts.uploadMethod, this.file, this);
    const data = this.prepareXhrRequest(uploadMethod, false, this.uploader.opts.method, this.bytes);
    
    xhr.send(data);
  }

  prepareXhrRequest(method: string, isTest: boolean, optMethod?: string, blob?: Blob | null): FormData | null {
    // Add data from the query options
    const query = utils.evalOpts(this.uploader.opts.query, this.file, this, isTest);
    let target = utils.evalOpts(this.uploader.opts.target, this.file, this, isTest);
    
    const params: string[] = [];
    const func = (value: any, key: string) => {
      if (utils.isObject(value) && value.toString() === '[object Object]') {
        utils.each(value, (v: any, k: string) => {
          func(v, key + '[' + k + ']');
        });
      } else if (utils.isArray(value)) {
        utils.each(value, (v: any) => {
          func(v, key + '[]');
        });
      } else {
        params.push(
          encodeURIComponent(key) + '=' +
          encodeURIComponent(value as string)
        );
      }
    };
    
    utils.each(query, func);
    
    // Build the URL taking the query into account
    target = this.getTarget(target, params);
    
    // Method may be a function that returns a method
    method = method.toLowerCase() as string || 'get';
    
    // Send each chunk in order
    this.xhr = new XMLHttpRequest();
    this.xhr.open(method, target);
    
    // Set the headers
    const headers = utils.evalOpts(this.uploader.opts.headers, this.file, this, isTest);
    
    utils.each(headers, (value: string, key: string) => {
      this.xhr!.setRequestHeader(key, value);
    });

    const data = new FormData();
    
    if ((optMethod || 'multipart') === 'multipart') {
      const params = this.uploader.opts.processParams(this.getParams());
      
      utils.each(params, (value, key) => {
        data.append(key, value);
      });
      
      if (blob) {
        data.append(this.uploader.opts.fileParameterName, blob, this.file.name);
      }
    }
    
    this.xhr.withCredentials = this.uploader.opts.withCredentials;
    
    return data;
  }

  abort(): void {
    if (this.xhr) {
      this.xhr.abort();
    }
    this.xhr = null;
  }

  status(isTest?: boolean): string {
    if (this.pendingRetry) {
      return Chunk.STATUS.RETRY;
    } else if (!isTest && this.xhr) {
      if (this.xhr.readyState < 4) {
        // Status is actually 'OPENED', 'HEADERS_RECEIVED'
        // or 'LOADING' - meaning that stuff is happening
        return Chunk.STATUS.UPLOADING;
      } else {
        if (this.uploader.opts.successStatuses.indexOf(this.xhr.status) > -1) {
          // The chunk upload finished successfully.
          return Chunk.STATUS.SUCCESS;
        } else if (this.uploader.opts.permanentErrors.indexOf(this.xhr.status) > -1 ||
            this.retries >= this.uploader.opts.maxChunkRetries) {
          // The chunk upload failed permanently
          return Chunk.STATUS.ERROR;
        } else {
          // The chunk upload failed, but retries are allowed
          return Chunk.STATUS.RETRY;
        }
      }
    } else {
      if (!this.preprocessState) {
        return Chunk.STATUS.PENDING;
      } else if (this.preprocessState === 1) {
        return Chunk.STATUS.PREPROCESSING;
      } else if (!this.readState) {
        return Chunk.STATUS.PENDING;
      } else if (this.readState === 1) {
        return Chunk.STATUS.READING;
      } else {
        return Chunk.STATUS.PENDING;
      }
    }
  }

  message(): string {
    return this.xhr ? this.xhr.responseText : '';
  }

  doneHandler(event: Event): void {
    const status = this.status();
    const response = this.message();

    if (this.uploader.opts.processResponse) {
      this.uploader.opts.processResponse(response, (err: Error | null, responseObj?: any) => {
        this.processResponseDone(err, responseObj, status);
      });
    } else {
      this.processResponseDone(null, response, status);
    }
  }

  processResponseDone(err: Error | null, response: any, status: string): void {
    if (err) {
      return this.uploader.uploadNextChunk();
    }
    
    if (this.uploader.opts.checkChunkUploadedByResponse) {
      const isUploaded = this.uploader.opts.checkChunkUploadedByResponse(this, response);
      if (isUploaded) {
        this.xhr!.status = 200;
        status = 'success';
      }
    }
    
    if (status === Chunk.STATUS.SUCCESS) {
      this._event(status, response);
      this.uploader.uploadNextChunk();
    } else if (status === Chunk.STATUS.RETRY) {
      const waitTime = Math.min(this.uploader.opts.chunkRetryInterval || 0, Math.pow(2, this.retries) * 1000);
      this.pendingRetry = true;
      this.retries++;
      setTimeout(() => {
        this.pendingRetry = false;
        this.send();
      }, waitTime);
    } else {
      this._event(status, response);
      this.uploader.uploadNextChunk();
    }
  }
}

export default Chunk;
