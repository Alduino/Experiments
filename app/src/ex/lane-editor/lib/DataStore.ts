import {LaneSegment} from "./LaneSegment";
import {LaneSegmentConnection} from "./LaneSegmentConnection";

export type DataStoreKey<Type extends keyof DataStoreTypes> = `${Type}:${string}`;
export type AnyDataStoreKey = DataStoreKey<keyof DataStoreTypes>;

interface DataStoreTypes {
    laneSeg: LaneSegment;
    laneSegConn: LaneSegmentConnection;
}

type DataStoreBackingMaps = {
    [Key in keyof DataStoreTypes]?: Map<DataStoreKey<Key>, DataStoreTypes[Key]>;
};

export class DataStore {
    readonly #maps = new Map<keyof DataStoreTypes, DataStoreBackingMaps[keyof DataStoreTypes]>();

    has<Type extends keyof DataStoreTypes>(key: DataStoreKey<Type>): boolean {
        const type = key.split(":", 1)[0] as Type;
        const map = this.#setup<Type>(type);
        return map.has(key);
    }

    get<Type extends keyof DataStoreTypes>(key: DataStoreKey<Type>): DataStoreTypes[Type] {
        const type = key.split(":", 1)[0] as Type;
        const map = this.#setup<Type>(type);
        const value = map.get(key);
        if (!value) throw new Error(`Missing ${key}`);
        return value;
    }

    set<Type extends keyof DataStoreTypes>(key: DataStoreKey<Type>, value: DataStoreTypes[Type]) {
        const type = key.split(":", 1)[0] as Type;
        const map = this.#setup<Type>(type);
        map.set(key, value);
    }

    list<Type extends keyof DataStoreTypes>(type: Type): ReadonlySet<DataStoreKey<Type>> {
        const map = this.#setup<Type>(type);
        return new Set(map.keys());
    }

    register<Type extends keyof DataStoreTypes>(obj: DataStoreTypes[Type] & { id: DataStoreKey<Type> }) {
        this.set<Type>(obj.id, obj);
    }

    isType<Type extends keyof DataStoreTypes>(key: AnyDataStoreKey | undefined, type: Type): key is DataStoreKey<Type> {
        if (!key) return false;
        return key.split(":", 1)[0] === type;
    }

    delete<Type extends keyof DataStoreTypes>(key: DataStoreKey<Type>) {
        const type = key.split(":", 1)[0] as Type;
        const map = this.#setup<Type>(type);
        map.delete(key);
    }

    #setup<Type extends keyof DataStoreTypes>(type: keyof DataStoreTypes): DataStoreBackingMaps[Type] {
        if (this.#maps.has(type)) {
            return this.#maps.get(type) as DataStoreBackingMaps[Type];
        } else {
            const map = new Map();
            this.#maps.set(type, map);
            return map;
        }
    }
}

export const dataStore = new DataStore();
