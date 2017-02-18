import * as fs from "fs";
import * as glob from "glob";
import * as http from "http";
import * as path from "path";
import * as schedule from "node-schedule";
import * as util from "util";

import ExecutionContext from "./ExecutionContext";
import { IFunction } from "./IFunction";
import TimerInfo from "./TimerInfo";
import TriggerFunction from "./TriggerFunction";
import { parse } from "url";

import stripJsonComments = require("strip-json-comments");

export default class Wrapper {
    private static getFunctions = (functionsPath: string) => {
        functionsPath = path.join(functionsPath, "/**/function.json");
        let functionFiles = new Array<string>()
        if (path.isAbsolute(functionsPath)) {
            functionFiles = glob.sync(functionsPath);
        } else {
            functionFiles = glob.sync(path.join(__dirname, functionsPath));
        }

        let functionPaths = functionFiles.map(functionFile => path.dirname(functionFile));

        return functionPaths.map<IFunction>(functionPath => {
            let filename = path.join(functionPath, "function.json");
            let json = fs.readFileSync(filename).toString();
            let configuration = JSON.parse(stripJsonComments(json));
            let name = path.basename(functionPath);

            return {
                configuration: configuration,
                module: require(path.join(functionPath, "index.js")),
                name: name,
                path: functionPath,
            };
        });
    }

    // Note: for now manual functions are just "startup"-tasks
    private static handleManualTriggers(triggers: Array<TriggerFunction>) {
        triggers.forEach(trigger => {
            let manualFunction = trigger.func;

            console.log(`Manual function '${manualFunction.name}' - start`);

            let context = new ExecutionContext(manualFunction);

            manualFunction.module(context);

            ExecutionContext.getPromise(context).then(() => {
                console.log(`Manual function '${manualFunction.name}' - finish`);
            }).catch(err => {
                console.error(`Manual function '${manualFunction.name}' - error: ${err}`);
            });
        });
    }

    private static handleHttpTriggers(triggers: Array<TriggerFunction>, port: number, keys: Array<string>) {
        if (triggers.length == 0) {
            return;
        }

        triggers.forEach((httpTrigger) => {
            let httpFunction = httpTrigger.func;
            let basename = path.basename(httpFunction.path);
            console.log(`HTTP function '/api/${basename}' mapped`);
        });

        let handleRequest = (request: http.IncomingMessage, response: http.ServerResponse) => {
            let body = Buffer.from([]);
            request.on("error", (err) => {
                console.error(err.stack);
            }).on("data", (chunk: any) => {
                body = Buffer.concat([body, chunk]);
            }).on("end", () => {
                let targetHttpTrigger = triggers.find(httpTrigger => {
                    let httpFunction = httpTrigger.func;
                    let basename = path.basename(httpFunction.path);
                    return request.url.startsWith(`/api/${basename}`);
                });

                if (targetHttpTrigger) {
                    console.log(`HTTP function '/api/${targetHttpTrigger.func.name}' triggered`);
                    let url = parse(request.url, true);

                    // Validate API key - /api/{function}?code={API key} OR x-functions-key header
                    // https://azure.microsoft.com/da-dk/documentation/articles/functions-bindings-http-webhook/#validate
                    let unauthorized = true;
                    if (targetHttpTrigger.binding.authLevel === "anonymous") {
                        unauthorized = false;
                    }

                    let code = url.query.code || request.headers["x-functions-key"];
                    if (unauthorized && code && keys.some(key => key === code)) {
                        unauthorized = false;
                    }

                    if (unauthorized) {
                        response.statusCode = 401;
                        response.end();
                        return;
                    }

                    // Build arguments for function
                    let req = {
                        binary: undefined, // not found on azure functions, hack
                        body: undefined,
                        method: request.method,
                        originalUrl: request.url,
                        query: url.query,
                    };

                    if (body.length) {
                        let str = new Buffer(body).toString();
                        req.body = JSON.parse(str);
                    }

                    // TODO: HttpExecutionContext class
                    let context = {
                        done: function (err?: any, res?: any) {
                            if (res) {
                                context.res = res;
                            }
                            if (context.res.status) {
                                response.statusCode = context.res.status;
                            } else {
                                response.statusCode = 200;
                            }
                            if (context.res.body) {
                                response.end(context.res.body);
                            } else {
                                response.end();
                            }

                            if (req.binary && fs.existsSync(req.binary)) {
                                fs.unlinkSync(req.binary);
                            }
                        },
                        log: function (msg, ...args) {
                            if (args && args.length) {
                                console.log(util.format(msg, args));
                            } else {
                                console.log(msg);
                            }
                        },
                        res: {
                            body: undefined,
                            status: undefined,
                        },
                    };

                    if (targetHttpTrigger.func.module.default) {
                        targetHttpTrigger.func.module.default(context, req);
                    } else {
                        targetHttpTrigger.func.module(context, req);
                    }
                } else {
                    response.statusCode = 404;
                    response.end();
                }
            });
        };

        let server = http.createServer(handleRequest);
        server.listen(port, () => {
            console.log(`Server listening on: http://localhost:${port}`);
        });
    }

    private static handleTimerTriggers(triggers: Array<TriggerFunction>) {
        triggers.forEach(timerTrigger => {
            let timerFunction = timerTrigger.func;
            let cron = timerTrigger.binding.schedule;

            console.log(`Scheduled timer function '${timerFunction.name}' to '${cron}'`);

            schedule.scheduleJob(cron, () => {
                let context = new ExecutionContext(timerFunction);
                let timer = new TimerInfo();

                console.log(`Scheduled function '${timerFunction.name}' - start`);

                timerFunction.module(context, timer);

                ExecutionContext.getPromise(context).then(() => {
                    console.log(`Scheduled function '${timerFunction.name}' - finish`);
                }).catch(err => {
                    console.error(`Scheduled function '${timerFunction.name}' - error: ${err}`);
                });
            });
        });
    }

    public static start = (path: string, port: number = 80, keys: Array<string> = []) => {
        let functions = Wrapper.getFunctions(path);

        // Filter out disabled functions
        functions = functions.filter(f => !f.configuration.disabled);

        let getTriggers = (type: string) => {
            let funcs = functions.filter(f => f.configuration.bindings.some(b => b.type === type));
            return funcs.map(func => new TriggerFunction(func, func.configuration.bindings.find(binding => binding.type === type)));
        };

        Wrapper.handleManualTriggers(getTriggers("manualTrigger"));
        Wrapper.handleHttpTriggers(getTriggers("httpTrigger"), port, keys);
        Wrapper.handleTimerTriggers(getTriggers("timerTrigger"));
    }

    // TODO
    // public stop = () => {
    // }
}