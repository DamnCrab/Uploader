import utils from './utils';
import Chunk from './chunk';
import { FileObject } from './types';

function parsePaths(path: string): string[] {
  const ret: string[] = [];
  const paths = path.split('/');
  let p = '';
  for (let i = 0; i < paths.length; i++) {
    if (!paths[i]) {
      continue;
    }
    p += paths[i] + '/';
    ret.push(p);
  }
  return ret;
}

export class File {
  public uploader: any;
  public isRoot: boolean;
  public isFolder: boolean;
  public parent: File | null;
  public files: File[];
  public fileList: File[];
  public chunks: Chunk[];
  private _errorFiles: File[];
  public file: FileObject | null;
  public id: number;
  public path?: string;
  public name?: string;
  public fileType?: string;
  public size?: number;
  public relativePath?: string;
  public paused: boolean;
  public error: boolean;
  public allError: boolean;
  public aborted: boolean;
  public completed: boolean;
  public averageSpeed: number;
  public currentSpeed: number;
  private _lastProgressCallback: number;
  private _prevUploadedSize: number;
  private _prevProgress: number;
  private _processingResponse: boolean = false;
  private _firstProgressCall: boolean = true;
  private uniqueIdentifier: string = '';

  constructor(uploader: any, file?: FileObject | string, parent?: File | null) {
    utils.defineNonEnumerable(this, 'uploader', uploader);
    this.isRoot = this.isFolder = uploader === this;
    utils.defineNonEnumerable(this, 'parent', parent || null);
    utils.defineNonEnumerable(this, 'files', []);
    utils.defineNonEnumerable(this, 'fileList', []);
    utils.defineNonEnumerable(this, 'chunks', []);
    utils.defineNonEnumerable(this, '_errorFiles', []);
    utils.defineNonEnumerable(this, 'file', null);
    this.id = utils.uid();

    if (this.isRoot || !file) {
      this.file = null;
    } else {
      if (utils.isString(file)) {
        // folder
        this.isFolder = true;
        this.file = null;
        this.path = file as string;
        if (this.parent && this.parent.path) {
          file = (file as string).substr(this.parent.path.length);
        }
        this.name = (file as string).charAt((file as string).length - 1) === '/' 
          ? (file as string).substr(0, (file as string).length - 1) 
          : file as string;
      } else {
        this.file = file as FileObject;
        this.fileType = this.file.type;
        this.name = this.file.fileName || this.file.name;
        this.size = this.file.size;
        this.relativePath = this.file.relativePath || this.file.webkitRelativePath || this.name;
        this._parseFile();
      }
    }

    this.paused = uploader.opts.initialPaused;
    this.error = false;
    this.allError = false;
    this.aborted = false;
    this.completed = false;
    this.averageSpeed = 0;
    this.currentSpeed = 0;
    this._lastProgressCallback = Date.now();
    this._prevUploadedSize = 0;
    this._prevProgress = 0;

    this.bootstrap();
  }

  _parseFile(): void {
    const ppaths = parsePaths(this.relativePath || '');
    if (ppaths.length) {
      const filePaths = this.uploader.filePaths;
      utils.each(ppaths, function(this: File, path: string, i: number) {
        let folderFile = filePaths[path];
        if (!folderFile) {
          folderFile = new File(this.uploader, path, this.parent);
          filePaths[path] = folderFile;
          this._updateParentFileList(folderFile);
        }
        this.parent = folderFile;
        folderFile.files.push(this);
        if (!ppaths[i + 1]) {
          folderFile.fileList.push(this);
        }
      }, this);
    } else {
      this._updateParentFileList();
    }
  }

  _updateParentFileList(file?: File): void {
    if (!file) {
      file = this;
    }
    const p = this.parent;
    if (p) {
      p.fileList.push(file);
    }
  }

  _eachAccess(eachFn: (f: File, i: number) => boolean | void, fileFn: (f: File) => void): void {
    if (this.isFolder) {
      utils.each(this.files, function(this: File, f, i) {
        return eachFn.call(this, f, i);
      }, this);
      return;
    }
    fileFn.call(this, this);
  }

  bootstrap(): void {
    if (this.isFolder) return;
    const opts = this.uploader.opts;
    if (utils.isFunction(opts.initFileFn)) {
      opts.initFileFn.call(this, this);
    }

    this.abort(true);
    this._resetError();
    // Rebuild stack
    this._prevProgress = 0;
    const round = opts.forceChunkSize ? Math.ceil : Math.floor;
    const chunks = Math.max(
      round(this.size as number / opts.chunkSize), 1
    );
    for (let offset = 0; offset < chunks; offset++) {
      this.chunks.push(new Chunk(this.uploader, this, offset));
    }
  }

  _measureSpeed(): void {
    const timeSpan = Date.now() - this._lastProgressCallback;
    if (!timeSpan) {
      return;
    }
    
    const smoothingFactor = this.uploader.opts.speedSmoothingFactor;
    const uploaded = this.sizeUploaded();
    // Prevent negative upload speed after file upload resume
    this.currentSpeed = Math.max((uploaded - this._prevUploadedSize) / timeSpan * 1000, 0);
    this.averageSpeed = smoothingFactor * this.currentSpeed + (1 - smoothingFactor) * this.averageSpeed;
    
    this._prevUploadedSize = uploaded;
  }

  _chunkEvent(chunk: Chunk, event: string, message?: string): void {
    if (event === 'progress') {
      this._calculateProgress();
      if (this.aborted) {
        return;
      }
      const now = Date.now();
      const calc = this.uploader.opts.progressCallbacksInterval;
      if (calc > 0) {
        const diff = now - this._lastProgressCallback;
        if (diff < calc && !this._firstProgressCall) {
          return;
        }
        this._firstProgressCall = false;
        this._lastProgressCallback = Date.now();
        this._measureSpeed();
      }
      this.uploader._trigger('fileProgress', this, chunk);
      return;
    }
    
    switch (event) {
      case Chunk.STATUS.SUCCESS:
        this._updateUploadedChunks(message, chunk);
        break;
      case Chunk.STATUS.ERROR:
        this._error();
        break;
      case Chunk.STATUS.PROGRESS:
        break;
      case Chunk.STATUS.RETRY:
        this.uploader._trigger('fileRetry', this, chunk);
        break;
    }
  }

  _updateUploadedChunks(message: string | undefined, chunk: Chunk): void {
    const checkChunkUploaded = this.uploader.opts.checkChunkUploadedByResponse;
    if (checkChunkUploaded) {
      let xhr = chunk.xhr as XMLHttpRequest;
      let response = message;
      let validateResponse = checkChunkUploaded(chunk, response);
      if (!validateResponse) {
        chunk.abort();
        chunk.send();
        return;
      }
    }

    chunk.markComplete();
    this._calculateProgress();
    
    if (this.isComplete()) {
      this.uploader._trigger('fileSuccess', this, message, chunk);
      
      if (this.isRoot) {
        if (!this.error && !this._findErrorInFile()) {
          this._finished();
        }
      } else {
        let parent = this.parent;
        let error = this.error;
        while (parent && !error) {
          if (parent.isComplete()) {
            parent.uploader._trigger('fileSuccess', parent, message, chunk);
            if (parent === this.uploader) {
              if (!this.error && !this._findErrorInFile()) {
                parent._finished();
              }
              return;
            }
            parent = parent.parent;
          } else {
            return;
          }
        }
      }
    }
  }
  
  _findErrorInFile(): boolean {
    let file = this;
    if (file.error) {
      return true;
    }
    
    if (file.isFolder) {
      for (let i = 0; i < file.files.length; i++) {
        if (file.files[i].error) {
          return true;
        }
      }
    }
    return false;
  }
  
  markComplete(): void {
    if (this.error) {
      return;
    }
    
    let completed = true;
    if (!this.isFolder) {
      for (let i = 0; i < this.chunks.length; i++) {
        if (!this.chunks[i].status() === Chunk.STATUS.SUCCESS) {
          completed = false;
          break;
        }
      }
    } else {
      for (let i = 0; i < this.files.length; i++) {
        let file = this.files[i];
        if (!file.error && !file.completed) {
          completed = false;
          break;
        }
      }
    }
    
    if (completed) {
      this.completed = true;
      
      if (this.parent && !this._findErrorInFile()) {
        this.parent._checkProgress();
      }
    }
  }
  
  _error(): void {
    this.error = this.allError = true;
    this.abort(true);
  }

  _calculateProgress(): void {
    if (this.error) {
      this.progress = 1;
      return;
    }
    
    if (this.isFolder) {
      let totalSize = 0;
      let uploadedSize = 0;
      for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i];
        totalSize += file.size || 0;
        uploadedSize += (file.size || 0) * (file.progress || 0);
      }
      this.progress = totalSize > 0 ? uploadedSize / totalSize : 0;
    } else {
      // Weighted progress
      let totalSize = 0;
      let uploadedSize = 0;
      for (let i = 0; i < this.chunks.length; i++) {
        const chunk = this.chunks[i];
        totalSize += chunk.endByte - chunk.startByte;
        
        switch (chunk.status()) {
          case Chunk.STATUS.SUCCESS:
          case Chunk.STATUS.ERROR:
            uploadedSize += chunk.endByte - chunk.startByte;
            break;
          case Chunk.STATUS.PROGRESS:
            uploadedSize += (chunk.endByte - chunk.startByte) * (chunk.loaded / chunk.total);
            break;
        }
      }
      this.progress = totalSize > 0 ? uploadedSize / totalSize : 0;
    }
    
    if (this.parent && !this.parent.isRoot) {
      this.parent._checkProgress();
    }
  }

  _checkProgress(): void {
    this._calculateProgress();
    
    if (this.parent && !this.parent.isRoot) {
      this.parent._checkProgress();
    }
  }

  _resetError(): void {
    this.error = this.allError = false;
    
    if (this.isFolder) {
      utils.each(this.files, function(file: File) {
        file._resetError();
      });
    }
  }

  _finished(): void {
    this.uploader._trigger('complete');
  }

  isComplete(): boolean {
    const outstanding = false;
    let found = false;
    
    if (this.isFolder) {
      utils.each(this.files, function(file: File) {
        found = true;
        if (!file.isComplete()) {
          outstanding = true;
          return false;
        }
      });
      return found && !outstanding;
    }
    
    let fileError = false;
    utils.each(this.chunks, function(chunk: Chunk) {
      const status = chunk.status();
      
      if (status === Chunk.STATUS.ERROR) {
        fileError = true;
        return false;
      }
      
      if (status !== Chunk.STATUS.SUCCESS) {
        outstanding = true;
        return false;
      }
    });
    
    if (fileError) {
      return false;
    }
    return !outstanding;
  }

  isUploading(): boolean {
    let uploading = false;
    if (this.isFolder) {
      utils.each(this.files, function(file: File) {
        if (file.isUploading()) {
          uploading = true;
          return false;
        }
      });
    } else {
      let outstanding = false;
      utils.each(this.chunks, function(chunk: Chunk) {
        const status = chunk.status();
        if (status === Chunk.STATUS.UPLOADING) {
          uploading = true;
          return false;
        }
      });
    }
    return uploading;
  }

  resume(): void {
    this._eachAccess(function(f: File) {
      f.resume();
    }, function(f: File) {
      if (f.error && f.chunks.length === 0) {
        f.bootstrap();
      }
      
      if (f.paused) {
        f.paused = false;
      }
      
      if (f.isComplete()) {
        return;
      }
      
      let fns = [];
      utils.each(f.chunks, function(chunk: Chunk) {
        if (chunk.status() === Chunk.STATUS.PENDING ||
          chunk.status() === Chunk.STATUS.ERROR) {
          fns.push(function(callback: () => void) {
            chunk.send();
            callback();
          });
        }
      });
      
      if (fns.length) {
        const uploader = f.uploader;
        const throttle = uploader.opts.simultaneousUploads;
        utils.each(fns.slice(0, throttle), function(fn: (cb: () => void) => void) {
          fn(() => {});
        });
      }
    });
  }

  pause(): void {
    this._eachAccess(function(f: File) {
      f.pause();
    }, function(f: File) {
      f.paused = true;
      utils.each(f.chunks, function(chunk: Chunk) {
        if (chunk.status() !== Chunk.STATUS.SUCCESS && chunk.status() !== Chunk.STATUS.ERROR) {
          chunk.abort();
          chunk.status(); // reset progress
        }
      });
    });
  }

  cancel(): void {
    this.uploader.removeFile(this);
  }

  retry(file?: File): void {
    if (file) {
      file.bootstrap();
      return;
    }
    
    this._eachAccess(function(f: File) {
      f.retry();
    }, function(f: File) {
      f.bootstrap();
    });
  }

  abort(reset?: boolean): void {
    if (reset) {
      this.chunks = [];
    }
    
    this._eachAccess(function(f: File) {
      f.abort(reset);
    }, function(f: File) {
      utils.each(f.chunks, function(chunk: Chunk) {
        chunk.abort();
      });
      if (reset) {
        f.chunks = [];
      }
    });
  }

  progress(): number {
    let totalProgress = 0;
    if (this.error) {
      return 1;
    }
    if (this.isFolder) {
      let totalDone = 0;
      let totalFiles = 0;
      utils.each(this.files, function(file: File) {
        totalFiles++;
        totalDone += file.progress;
      });
      totalProgress = totalFiles > 0 ? totalDone / totalFiles : 0;
    } else {
      // Sum up progress across everything
      let bytesLoaded = 0;
      let bytesTotal = parseInt(this.size as any, 10);
      
      // Loaded bytes for each chunk
      utils.each(this.chunks, function(chunk: Chunk) {
        // Only count progress on the active chunks
        bytesLoaded += chunk.progress() * (chunk.endByte - chunk.startByte);
      });
      
      totalProgress = bytesTotal > 0 ? bytesLoaded / bytesTotal : 0;
    }
    
    return totalProgress;
  }

  getSize(): number {
    let totalSize = 0;
    if (this.isFolder) {
      utils.each(this.files, function(file: File) {
        totalSize += file.size ?? 0;
      });
    } else {
      totalSize = this.size ?? 0;
    }
    return totalSize;
  }

  getFormatSize(): string {
    const size = this.getSize();
    if (size === 0) {
      return '0 B';
    }
    
    const unitArr = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const index = Math.floor(Math.log(size) / Math.log(1024));
    const powNum = Math.pow(1024, index);
    const finalSize = (size / powNum).toFixed(2);
    
    return finalSize + ' ' + unitArr[index];
  }

  sizeUploaded(): number {
    let size = 0;
    if (this.isFolder) {
      utils.each(this.files, function(file: File) {
        size += file.sizeUploaded();
      });
    } else {
      utils.each(this.chunks, function(chunk: Chunk) {
        size += chunk.loaded;
      });
    }
    return size;
  }

  timeRemaining(): number {
    if (this.paused || this.error) {
      return 0;
    }
    
    const smoothingFactor = this.uploader.opts.speedSmoothingFactor;
    const timeSpan = Date.now() - this._lastProgressCallback;
    
    if (!timeSpan) {
      return 0;
    }
    
    const averageSpeed = this.averageSpeed;
    const remainingBytes = this.size! - this.sizeUploaded();
    
    return averageSpeed > 0 ? Math.floor(remainingBytes / averageSpeed) : 0;
  }

  removeFile(file: File): void {
    if (file.isFolder) {
      while (file.files.length) {
        const f = file.files[file.files.length - 1];
        this._errorFiles.push(f);
        file.files.splice(file.files.length - 1, 1);
        file.fileList.splice(file.fileList.indexOf(f), 1);
        
        if (!f.isFolder) {
          this.uploader.files.splice(this.uploader.files.indexOf(f), 1);
        }
      }
    }
    
    // Remove from files list
    file.parent.files.splice(file.parent.files.indexOf(file), 1);
    file.parent.fileList.splice(file.parent.fileList.indexOf(file), 1);
    
    if (!file.isFolder) {
      this.uploader.files.splice(this.uploader.files.indexOf(file), 1);
    }
    
    // In case of currently uploading abort upload
    file.abort();
    
    this._resetError();
    
    if (this._errorFiles.length) {
      if (!file._i) {
        file._i = 0;
      } else {
        file._i++;
      }
    }
  }
}

export default File;
