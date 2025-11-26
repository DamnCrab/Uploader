import { utils } from './utils';
import { EventMap, EventCallback } from './types';

export const event = {
  _eventData: null as EventMap | null,

  on: function(name: string, func: EventCallback): void {
    if (!this._eventData) this._eventData = {};
    if (!this._eventData[name]) this._eventData[name] = [];
    let listened = false;
    utils.each(this._eventData[name], function(fuc) {
      if (fuc === func) {
        listened = true;
        return false;
      }
    });
    if (!listened) {
      this._eventData[name].push(func);
    }
  },

  off: function(name: string, func?: EventCallback): void {
    if (!this._eventData) this._eventData = {};
    if (!this._eventData[name] || !this._eventData[name].length) return;
    if (func) {
      utils.each(this._eventData[name], function(this: typeof event, fuc, i) {
        if (fuc === func) {
          this._eventData![name].splice(i as number, 1);
          return false;
        }
      }, this);
    } else {
      this._eventData[name] = [];
    }
  },

  trigger: function(name: string, ...args: any[]): boolean {
    if (!this._eventData) this._eventData = {};
    if (!this._eventData[name]) return true;
    let preventDefault = false;
    utils.each(this._eventData[name], function(this: typeof event, fuc) {
      preventDefault = fuc.apply(this, args) === false || preventDefault;
    }, this);
    return !preventDefault;
  }
};

export default event;
