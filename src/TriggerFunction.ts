import { IFunction } from "./IFunction";

export default class TriggerFunction {
    public constructor(public func: IFunction, public binding: any) {
    }
}