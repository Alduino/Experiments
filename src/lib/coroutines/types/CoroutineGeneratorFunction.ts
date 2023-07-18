import CoroutineGenerator from "./CoroutineGenerator";

type CoroutineGeneratorFunction<Context> = () => CoroutineGenerator<Context>;
export default CoroutineGeneratorFunction;
