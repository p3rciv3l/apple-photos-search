export declare function pointInBounds(lat: number, lon: number, bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}): boolean;
export declare function findMatchingRegions(locationQuery: string, geoIndex: any): any[];
export declare function expandRegionsWithDescendants(regions: any[], geoIndex: any): any[];
