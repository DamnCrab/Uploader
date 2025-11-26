import { EventMap, EventCallback } from './types';
export declare const event: {
    _eventData: EventMap | null;
    on: (name: string, func: EventCallback) => void;
    off: (name: string, func?: EventCallback) => void;
    trigger: (name: string, ...args: any[]) => boolean;
};
export default event;
