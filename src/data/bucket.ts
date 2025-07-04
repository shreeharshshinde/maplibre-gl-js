import type {CollisionBoxArray} from './array_types.g';
import type {Style} from '../style/style';
import type {TypedStyleLayer} from '../style/style_layer/typed_style_layer';
import type {FeatureIndex} from './feature_index';
import type {Context} from '../gl/context';
import type {FeatureStates} from '../source/source_state';
import type {ImagePosition} from '../render/image_atlas';
import type {CanonicalTileID} from '../source/tile_id';
import type {VectorTileFeature, VectorTileLayer} from '@mapbox/vector-tile';
import type Point from '@mapbox/point-geometry';
import type {SubdivisionGranularitySetting} from '../render/subdivision_granularity_settings';

export type BucketParameters<Layer extends TypedStyleLayer> = {
    index: number;
    layers: Array<Layer>;
    zoom: number;
    pixelRatio: number;
    overscaling: number;
    collisionBoxArray: CollisionBoxArray;
    sourceLayerIndex: number;
    sourceID: string;
    globalState: Record<string, any>;
};

export type PopulateParameters = {
    featureIndex: FeatureIndex;
    iconDependencies: {};
    patternDependencies: {};
    glyphDependencies: {};
    availableImages: Array<string>;
    subdivisionGranularity: SubdivisionGranularitySetting;
};

export type IndexedFeature = {
    feature: VectorTileFeature;
    id: number | string;
    index: number;
    sourceLayerIndex: number;
};

export type BucketFeature = {
    index: number;
    sourceLayerIndex: number;
    geometry: Array<Array<Point>>;
    properties: any;
    type: 0 | 1 | 2 | 3;
    id?: any;
    readonly patterns: {
        [_: string]: {
            'min': string;
            'mid': string;
            'max': string;
        };
    };
    sortKey?: number;
};

/**
 * @hidden
 * The `Bucket` interface is the single point of knowledge about turning vector
 * tiles into WebGL buffers.
 *
 * `Bucket` is an abstract interface. An implementation exists for each style layer type.
 * Create a bucket via the `StyleLayer.createBucket` method.
 *
 * The concrete bucket types, using layout options from the style layer,
 * transform feature geometries into vertex and index data for use by the
 * vertex shader.  They also (via `ProgramConfiguration`) use feature
 * properties and the zoom level to populate the attributes needed for
 * data-driven styling.
 *
 * Buckets are designed to be built on a worker thread and then serialized and
 * transferred back to the main thread for rendering.  On the worker side, a
 * bucket's vertex, index, and attribute data is stored in `bucket.arrays: ArrayGroup`.
 * When a bucket's data is serialized and sent back to the main thread,
 * is gets deserialized (using `new Bucket(serializedBucketData)`, with
 * the array data now stored in `bucket.buffers: BufferGroup`. BufferGroups
 * hold the same data as ArrayGroups, but are tuned for consumption by WebGL.
 */
export interface Bucket {
    layerIds: Array<string>;
    hasPattern: boolean;
    readonly layers: Array<any>;
    readonly stateDependentLayers: Array<any>;
    readonly stateDependentLayerIds: Array<string>;
    populate(features: Array<IndexedFeature>, options: PopulateParameters, canonical: CanonicalTileID): void;
    update(states: FeatureStates, vtLayer: VectorTileLayer, imagePositions: {[_: string]: ImagePosition}): void;
    isEmpty(): boolean;
    upload(context: Context): void;
    uploadPending(): boolean;
    /**
     * Release the WebGL resources associated with the buffers. Note that because
     * buckets are shared between layers having the same layout properties, they
     * must be destroyed in groups (all buckets for a tile, or all symbol buckets).
     */
    destroy(): void;
}

export function deserialize(input: Array<Bucket>, style: Style): {[_: string]: Bucket} {
    const output = {};

    // Guard against the case where the map's style has been set to null while
    // this bucket has been parsing.
    if (!style) return output;

    for (const bucket of input) {
        const layers = bucket.layerIds
            .map((id) => style.getLayer(id))
            .filter(Boolean);

        if (layers.length === 0) {
            continue;
        }

        // look up StyleLayer objects from layer ids (since we don't
        // want to waste time serializing/copying them from the worker)
        (bucket as any).layers = layers;
        if (bucket.stateDependentLayerIds) {
            (bucket as any).stateDependentLayers = bucket.stateDependentLayerIds.map((lId) => layers.filter((l) => l.id === lId)[0]);
        }
        for (const layer of layers) {
            output[layer.id] = bucket;
        }
    }

    return output;
}
