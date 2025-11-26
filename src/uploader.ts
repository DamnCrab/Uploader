import utils from './utils';
import event from './event';
import File from './file';
import Chunk from './chunk';
import { UploaderOptions, FileObject } from './types';

const version = '__VERSION__';

const isServer = typeof window === 'undefined';

// ie10+
const ie10plus = isServer ? false : (window.navigator as any).msPointerEnabled;

// 定义 Uploader.sliceName 类型，供后面使用
let sliceNameHolder: string;

const support = (function() {
  if (isServer) {
    return false;
  }
  let sliceName = 'slice';
  let _support = utils.isDefined(window.File) && utils.isDefined(window.Blob) &&
                utils.isDefined(window.FileList);
  let bproto = null;
  if (_support) {
    bproto = window.Blob.prototype;
    utils.each(['slice', 'webkitSlice', 'mozSlice'], function(n) {
      if ((bproto as any)[n]) {
        sliceName = n;
        return false;
      }
    });
    _support = !!(bproto as any)[sliceName];
  }
  if (_support) {
    sliceNameHolder = sliceName; // 暂存sliceName的值
  }
  bproto = null;
  return _support;
})();

const supportDirectory = (function() {
  if (isServer) {
    return false;
  }
  const input = window.document.createElement('input');
  input.type = 'file';
  const sd = 'webkitdirectory' in input || 'directory' in input;
  return sd;
})();

/**
 * Default read function using the webAPI
 * @param fileObj - 文件对象
 * @param fileType - 文件类型
 * @param startByte - 开始字节
 * @param endByte - 结束字节
 * @param chunk - 块对象
 */
const webAPIFileRead = function(fileObj: any, fileType: string, startByte: number, endByte: number, chunk: any): void {
  chunk.readFinished(fileObj.file[Uploader.sliceName](startByte, endByte, fileType));
};

class Uploader extends File {
  static version: string = version;
  static sliceName: string = sliceNameHolder; // 使用暂存的sliceName值
  static utils = utils;
  static event = event;
  static File = File;
  static Chunk = Chunk;
  public support: boolean;
  public supportDirectory: boolean;
  public filePaths: Record<string, File>;
  public opts: UploaderOptions;
  public preventEvent: (e: Event) => void;
  private _onDrop: ((e: DragEvent) => void) | null = null;

  static defaults: UploaderOptions = {
    chunkSize: 1024 * 1024,
    forceChunkSize: false,
    simultaneousUploads: 3,
    singleFile: false,
    fileParameterName: 'file',
    progressCallbacksInterval: 500,
    speedSmoothingFactor: 0.1,
    query: {},
    headers: {},
    withCredentials: false,
    preprocess: null,
    method: 'multipart',
    testMethod: 'GET',
    uploadMethod: 'POST',
    prioritizeFirstAndLastChunk: false,
    allowDuplicateUploads: false,
    target: '/',
    testChunks: true,
    generateUniqueIdentifier: null,
    maxChunkRetries: 0,
    chunkRetryInterval: null,
    permanentErrors: [404, 415, 500, 501],
    successStatuses: [200, 201, 202],
    onDropStopPropagation: false,
    initFileFn: null,
    readFileFn: webAPIFileRead,
    checkChunkUploadedByResponse: null,
    initialPaused: false,
    processResponse: function(response: any, cb: (err: Error | null, response?: any) => void) {
      cb(null, response);
    },
    processParams: function(params: Record<string, any>) {
      return params;
    }
  };

  constructor(opts?: Partial<UploaderOptions>) {
    super(null as any); // 临时传递null，在构造函数后部分重新初始化

    this.support = support;
    /* istanbul ignore if */
    if (!this.support) {
      return;
    }

    this.supportDirectory = supportDirectory;
    utils.defineNonEnumerable(this, 'filePaths', {});
    
    // 确保opts不是null或undefined
    this.opts = utils.extend({}, Uploader.defaults, opts || {}) as UploaderOptions;

    this.preventEvent = utils.bind(this._preventEvent, this);

    // 重新初始化基类
    File.call(this, this);
  }

  _trigger(name: string, ...args: any[]): boolean {
    const allArgs = utils.toArray(arguments);
    let preventDefault = !this.trigger.apply(this, allArgs);
    if (name !== 'catchAll') {
      allArgs.unshift('catchAll');
      preventDefault = !this.trigger.apply(this, allArgs) || preventDefault;
    }
    return !preventDefault;
  }

  _triggerAsync(...args: any[]): void {
    utils.nextTick(() => {
      this._trigger.apply(this, args);
    }, this);
  }

  addFiles(files: FileList | Array<File | FileObject>, evt?: Event): void {
    const _files: File[] = [];
    const oldFileListLen = this.fileList.length;
    
    utils.each(files, function(this: Uploader, file) {
      // Uploading empty file IE10/IE11 hangs indefinitely
      // Directories have size `0` and name `.`
      // Ignore already added files if opts.allowDuplicateUploads is set to false
      if ((!ie10plus || ie10plus && file.size > 0) && 
          !(file.size % 4096 === 0 && 
           (file.name === '.' || (file as any).fileName === '.'))) {
             
        const uniqueIdentifier = this.generateUniqueIdentifier(file);
        if (this.opts.allowDuplicateUploads || !this.getFromUniqueIdentifier(uniqueIdentifier)) {
          const _file = new File(this, file, this);
          _file.uniqueIdentifier = uniqueIdentifier;
          if (this._trigger('fileAdded', _file, evt)) {
            _files.push(_file);
          } else {
            File.prototype.removeFile.call(this, _file);
          }
        }
      }
    }, this);
    
    // get new fileList
    const newFileList = this.fileList.slice(oldFileListLen);
    
    if (this._trigger('filesAdded', _files, newFileList, evt)) {
      utils.each(_files, function(this: Uploader, file) {
        if (this.opts.singleFile && this.files.length > 0) {
          this.removeFile(this.files[0]);
        }
        this.files.push(file);
      }, this);
      this._trigger('filesSubmitted', _files, newFileList, evt);
    } else {
      utils.each(newFileList, function(this: Uploader, file) {
        File.prototype.removeFile.call(this, file);
      }, this);
    }
  }

  addFile(file: File | FileObject, evt?: Event): void {
    this.addFiles([file], evt);
  }

  cancel(): void {
    for (let i = this.fileList.length - 1; i >= 0; i--) {
      this.fileList[i].cancel();
    }
  }

  removeFile(file: File): void {
    File.prototype.removeFile.call(this, file);
    this._trigger('fileRemoved', file);
  }

  generateUniqueIdentifier(file: File | FileObject): string {
    const custom = this.opts.generateUniqueIdentifier;
    if (utils.isFunction(custom)) {
      return custom(file);
    }
    /* istanbul ignore next */
    // Some confusion in different versions of Firefox
    const relativePath = (file as any).relativePath || 
                        (file as any).webkitRelativePath || 
                        (file as any).fileName || 
                        file.name;
    /* istanbul ignore next */
    return file.size + '-' + relativePath.replace(/[^0-9a-zA-Z_-]/img, '');
  }

  getFromUniqueIdentifier(uniqueIdentifier: string): File | false {
    let ret: File | false = false;
    utils.each(this.files, function(file) {
      if (file.uniqueIdentifier === uniqueIdentifier) {
        ret = file;
        return false;
      }
    });
    return ret;
  }

  uploadNextChunk(preventEvents?: boolean): boolean {
    let found = false;
    const pendingStatus = Chunk.STATUS.PENDING;
    const checkChunkUploaded = this.opts.checkChunkUploadedByResponse;
    
    if (this.opts.prioritizeFirstAndLastChunk) {
      utils.each(this.files, function(file) {
        if (file.paused) {
          return;
        }
        if (checkChunkUploaded && !(file as any)._firstResponse && file.isUploading()) {
          // waiting for current file's first chunk response
          return;
        }
        if (file.chunks.length && file.chunks[0].status() === pendingStatus) {
          file.chunks[0].send();
          found = true;
          return false;
        }
        if (file.chunks.length > 1 && file.chunks[file.chunks.length - 1].status() === pendingStatus) {
          file.chunks[file.chunks.length - 1].send();
          found = true;
          return false;
        }
      });
      if (found) {
        return found;
      }
    }

    // Now, simply look for the next, best thing to upload
    utils.each(this.files, function(file) {
      if (!file.paused) {
        if (checkChunkUploaded && !(file as any)._firstResponse && file.isUploading()) {
          // waiting for current file's first chunk response
          return;
        }
        utils.each(file.chunks, function(chunk) {
          if (chunk.status() === pendingStatus) {
            chunk.send();
            found = true;
            return false;
          }
        });
      }
      if (found) {
        return false;
      }
    });
    
    if (found) {
      return true;
    }

    // The are no more outstanding chunks to upload, check is everything is done
    let outstanding = false;
    utils.each(this.files, function(file) {
      if (!file.isComplete()) {
        outstanding = true;
        return false;
      }
    });
    
    // should check files now
    // if now files in list
    // should not trigger complete event
    if (!outstanding && !preventEvents && this.files.length) {
      // All chunks have been uploaded, complete
      this._triggerAsync('complete');
    }
    return outstanding;
  }

  upload(preventEvents?: boolean): void {
    // Make sure we don't start too many uploads at once
    const ret = this._shouldUploadNext();
    if (ret === false) {
      return;
    }
    
    !preventEvents && this._trigger('uploadStart');
    let started = false;
    for (let num = 1; num <= this.opts.simultaneousUploads - (ret as number); num++) {
      started = this.uploadNextChunk(!!preventEvents) || started;
      if (!started && preventEvents) {
        // completed
        break;
      }
    }
    
    if (!started && !preventEvents) {
      this._triggerAsync('complete');
    }
  }

  /**
   * should upload next chunk
   * @returns {boolean|number}
   */
  _shouldUploadNext(): boolean | number {
    let num = 0;
    let should = true;
    const simultaneousUploads = this.opts.simultaneousUploads;
    const uploadingStatus = Chunk.STATUS.UPLOADING;
    
    utils.each(this.files, function(file) {
      utils.each(file.chunks, function(chunk) {
        if (chunk.status() === uploadingStatus) {
          num++;
          if (num >= simultaneousUploads) {
            should = false;
            return false;
          }
        }
      });
      return should;
    });
    
    // if should is true then return uploading chunks's length
    return should && num;
  }

  /**
   * Assign a browse action to one or more DOM nodes.
   * @param domNodes DOM元素或DOM元素数组
   * @param isDirectory 是否允许选择目录
   * @param singleFile 是否单文件上传
   * @param attributes 设置input元素的自定义属性
   */
  assignBrowse(
    domNodes: Element | Element[] | NodeList, 
    isDirectory?: boolean, 
    singleFile?: boolean, 
    attributes?: Record<string, string>
  ): void {
    if (typeof (domNodes as NodeList).length === 'undefined') {
      domNodes = [domNodes as Element];
    }

    utils.each(domNodes, function(this: Uploader, domNode) {
      let input: HTMLInputElement;
      if (domNode.tagName === 'INPUT' && (domNode as HTMLInputElement).type === 'file') {
        input = domNode as HTMLInputElement;
      } else {
        input = document.createElement('input');
        input.setAttribute('type', 'file');
        
        // display:none - not working in opera 12
        utils.extend(input.style, {
          visibility: 'hidden',
          position: 'absolute',
          width: '1px',
          height: '1px'
        });
        
        // for opera 12 browser, input must be assigned to a document
        domNode.appendChild(input);
        
        // https://developer.mozilla.org/en/using_files_from_web_applications
        // event listener is executed two times
        // first one - original mouse click event
        // second - input.click(), input is inside domNode
        domNode.addEventListener('click', function(e) {
          if (domNode.tagName.toLowerCase() === 'label') {
            return;
          }
          input.click();
        }, false);
      }
      
      if (!this.opts.singleFile && !singleFile) {
        input.setAttribute('multiple', 'multiple');
      }
      
      if (isDirectory) {
        input.setAttribute('webkitdirectory', 'webkitdirectory');
      }
      
      attributes && utils.each(attributes, function(value, key) {
        input.setAttribute(key, value);
      });
      
      // When new files are added, simply append them to the overall list
      const that = this;
      input.addEventListener('change', function(e) {
        that._trigger(e.type, e);
        if (e.target && (e.target as HTMLInputElement).value) {
          that.addFiles((e.target as HTMLInputElement).files as FileList, e);
          (e.target as HTMLInputElement).value = '';
        }
      }, false);
    }, this);
  }

  onDrop(evt: DragEvent): void {
    this._trigger(evt.type, evt);
    if (this.opts.onDropStopPropagation) {
      evt.stopPropagation();
    }
    evt.preventDefault();
    this._parseDataTransfer(evt.dataTransfer, evt);
  }

  _parseDataTransfer(dataTransfer: DataTransfer | null, evt: Event): void {
    if (!dataTransfer) return;
    
    if (dataTransfer.items && dataTransfer.items[0] &&
      dataTransfer.items[0].webkitGetAsEntry) {
      this.webkitReadDataTransfer(dataTransfer, evt);
    } else {
      this.addFiles(dataTransfer.files, evt);
    }
  }

  webkitReadDataTransfer(dataTransfer: DataTransfer, evt: Event): void {
    const self = this;
    let queue = dataTransfer.items.length;
    const files: File[] = [];
    
    utils.each(dataTransfer.items, function(item) {
      const entry = item.webkitGetAsEntry();
      if (!entry) {
        decrement();
        return;
      }
      if (entry.isFile) {
        // due to a bug in Chrome's File System API impl - #149735
        fileReadSuccess(item.getAsFile(), entry.fullPath);
      } else {
        readDirectory(entry.createReader());
      }
    });
    
    function readDirectory(reader: any) {
      reader.readEntries(function(entries: any[]) {
        if (entries.length) {
          queue += entries.length;
          utils.each(entries, function(entry) {
            if (entry.isFile) {
              const fullPath = entry.fullPath;
              entry.file(function(file: File) {
                fileReadSuccess(file, fullPath);
              }, readError);
            } else if (entry.isDirectory) {
              readDirectory(entry.createReader());
            }
          });
          readDirectory(reader);
        } else {
          decrement();
        }
      }, readError);
    }
    
    function fileReadSuccess(file: File, fullPath: string) {
      // relative path should not start with "/"
      (file as any).relativePath = fullPath.substring(1);
      files.push(file);
      decrement();
    }
    
    function readError(fileError: Error) {
      throw fileError;
    }
    
    function decrement() {
      if (--queue === 0) {
        self.addFiles(files, evt);
      }
    }
  }

  _assignHelper(domNodes: Element | Element[] | NodeList, handles: Record<string, EventListener>, remove?: boolean): void {
    if (typeof (domNodes as NodeList).length === 'undefined') {
      domNodes = [domNodes as Element];
    }
    
    const evtMethod = remove ? 'removeEventListener' : 'addEventListener';
    
    utils.each(domNodes, function(this: Uploader, domNode) {
      utils.each(handles, function(handler, name) {
        domNode[evtMethod](name, handler, false);
      }, this);
    }, this);
  }

  _preventEvent(e: Event): void {
    utils.preventEvent(e);
    this._trigger(e.type, e);
  }

  /**
   * Assign one or more DOM nodes as a drop target.
   * @param domNodes 
   */
  assignDrop(domNodes: Element | Element[] | NodeList): void {
    this._onDrop = utils.bind(this.onDrop, this);
    this._assignHelper(domNodes, {
      dragover: this.preventEvent as EventListener,
      dragenter: this.preventEvent as EventListener,
      dragleave: this.preventEvent as EventListener,
      drop: this._onDrop as EventListener
    });
  }

  /**
   * Un-assign drop event from DOM nodes
   * @param domNodes 
   */
  unAssignDrop(domNodes: Element | Element[] | NodeList): void {
    this._assignHelper(domNodes, {
      dragover: this.preventEvent as EventListener,
      dragenter: this.preventEvent as EventListener,
      dragleave: this.preventEvent as EventListener,
      drop: this._onDrop as EventListener
    }, true);
    this._onDrop = null;
  }
}

export default Uploader;

