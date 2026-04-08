export declare const PHOTOS_DB_PATH: string;
export declare function queryPhotosDb(sql: string, dbPath?: string): Promise<any[]>;
export declare function getPhotoMetadata(uuids: string[], dbPath?: string): Promise<Map<any, any>>;
export declare function findLocationMatches(locationQuery: string, uuids?: string[], dbPath?: string): Promise<Set<string>>;
