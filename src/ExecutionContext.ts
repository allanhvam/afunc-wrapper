import * as util from "util";

import {IFunction} from "./IFunction";

export default class ExecutionContext {
    private promise: Promise<any>;
    private resolve: (value?: any | PromiseLike<any>) => void;
    private reject: (reason?: any) => void;

    public static getPromise = (context: ExecutionContext) => {
        return context.promise;
    }

    constructor(public func: IFunction) {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    public log = (msg, ...args) => {
        let prefix = ``;
        if (this.func && this.func.name) {
            prefix = `${prefix}${this.func.name}: `;
        }
        msg = `${prefix}${msg}`;
        if (args && args.length) {
            console.log(util.format(msg, args));
        } else {
            console.log(msg);
        }
    }

    public done = (err?: any, propertyBag?: any) => {
        if (err && err.stack) {
            this.reject(err.stack);
            return;
        }
        if (err) {
            this.reject(err);
            return;
        }
        this.resolve();
    }
}
