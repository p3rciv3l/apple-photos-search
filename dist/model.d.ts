import { ProcessedImage, Clip } from '@frost-beta/clip';
/**
 * How many image embeddings are computed in on batch.
 *
 * After testing on x64 and arm64 Macs, hard-coding to 4 seems to be the best
 * value, a larger value uses more RAM and is not faster, and smaller value can
 * get slower or unstable.
 */
export declare const batchSize = 4;
/**
 * Each item kept in batch.
 */
export interface BatchItem {
    image: ProcessedImage;
    resolver: PromiseWithResolvers<number[]>;
}
/**
 * The message sent to worker.
 */
export interface BatchMessage {
    id: number;
    labels?: string[];
    images?: ProcessedImage[];
}
/**
 * The response received from worker.
 */
export interface BatchResponse {
    id: number;
    labelEmbeddings?: number[][];
    imageEmbeddings?: number[][];
}
/**
 * A pipeline that does image processing in current thread and embedding
 * computation in the worker.
 */
export declare class Model {
    private worker;
    private imageProcessor;
    private batch;
    private queueProcessImage;
    private queueComputeEmbeddings;
    private queueFlush;
    private nextId;
    /**
     * @param modelDir - Path to the CLIP model.
     */
    constructor(modelDir: string);
    /**
     * Get the embeddings for the image file located at filePath.
     * @param filePath - Path of the image file.
     */
    computeImageEmbeddings(filePath: string): Promise<number[]>;
    /**
     * Stop the worker and close the model.
     */
    close(): void;
    private addToBatch;
    private flush;
    private sendBatch;
}
/**
 * Create the proxy model.
 */
export declare function loadModel(): Promise<Model>;
/**
 * Create the CLIP model.
 */
export declare function loadClip(): Promise<Clip>;
