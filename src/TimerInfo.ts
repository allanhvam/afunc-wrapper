// https://github.com/Azure/azure-webjobs-sdk-extensions/blob/master/src/WebJobs.Extensions/Extensions/Timers/TimerInfo.cs
export default class TimerInfo {
    public schedule = undefined;
    public status = undefined;
    public isPastDue: boolean = undefined;
}
