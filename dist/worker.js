import { parentPort, workerData } from 'node:worker_threads';
import { Clip } from '@frost-beta/clip';
const clip = new Clip(workerData.modelDir, workerData.batchSize);
parentPort.on('message', ({ id, labels, images }) => {
    if (id == 0)
        process.exit(0);
    const response = { id };
    if (labels)
        response.labelEmbeddings = clip.computeLabelEmbeddingsJs(labels);
    if (images)
        response.imageEmbeddings = clip.computeImageEmbeddingsJs(images);
    parentPort.postMessage(response);
});
