export type CoroutineAwaitResult_Done<Data> = Data extends (void | never | undefined) ? {
    done: true;
} : {
    done: true;
    data: Data;
};

export type CoroutineAwaitResult_Wait = {
    done: false;
    data?: undefined;
};

type CoroutineAwaitResult<Data> = CoroutineAwaitResult_Done<Data> | CoroutineAwaitResult_Wait;
export default CoroutineAwaitResult;
