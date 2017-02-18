export interface IFunction {
    name: string;
    path: string;
    module: any;
    configuration: { disabled: boolean, bindings: Array<any> };
}
