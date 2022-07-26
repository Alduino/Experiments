const DEBOUNCE_PERIOD_MS = 250;
const IDLE_TIMEOUT_MS = 250;
const IDLE_EARLY_END_MS = 2;

export const enum Priority {
    /**
     * Schedules the job to run on the next trigger call.
     */
    high,

    /**
     * Runs the job after no requests have come in for 250 ms.
     */
    debounce,

    /**
     * Schedules the job to run during idle time.
     * If the runtime doesn't support `requestIdleCallback`, this priority operates the same as `debounce`.
     */
    low
}

export interface JobFunctionContext {
    /**
     * Gets the amount of time left to do this job. Returns `Infinity` unless the job is low priority.
     */
    getTimeRemaining(): number;
}

export interface JobFunction {
    (context: JobFunctionContext): void;
}

export interface Job {
    readonly priority: Priority;
    readonly fn: JobFunction;
}

const returnInfinity = () => Infinity;

export class JobScheduler {
    readonly #jobs = new Map<symbol, Job>();
    readonly #scheduledJobs = new Map<Priority, Set<symbol>>();
    readonly #lastScheduleTimes = new Map<symbol, number>();
    readonly #supportsRequestIdleCallback = typeof requestIdleCallback === "function";

    #hasLowPriorityCallback = false;

    register(identifier: symbol, init: Job) {
        this.#jobs.set(identifier, init);
    }

    schedule(identifier: symbol) {
        const job = this.#jobs.get(identifier);
        if (!job) throw new Error("Job has not been registered");

        const priority = this.#getSupportedPriority(job.priority);

        const prioritySet = this.#getScheduleSet(priority);
        prioritySet.add(identifier);

        if (priority === Priority.debounce) {
            this.#lastScheduleTimes.set(identifier, performance.now());
        }
    }

    /**
     * Runs any jobs that are ready.
     * Note, any low-priority jobs may run outside this call, as they use `requestIdleCallback`.
     */
    runJobs() {
        this.#runHighPriorityJobs();
        this.#setupLowPriorityCallback();
        this.#runDebouncedJobs();
    }

    #getScheduleSet(priority: Priority) {
        const existing = this.#scheduledJobs.get(priority);
        if (existing) return existing;

        const set = new Set<symbol>();
        this.#scheduledJobs.set(priority, set);

        return set;
    }

    #runHighPriorityJobs() {
        const set = this.#getScheduleSet(Priority.high);

        try {
            for (const job of set) {
                const {fn} = this.#jobs.get(job);

                fn({
                    getTimeRemaining: returnInfinity
                });
            }
        } finally {
            set.clear();
        }
    }

    #setupLowPriorityCallback() {
        if (this.#hasLowPriorityCallback || !this.#supportsRequestIdleCallback) return;

        requestIdleCallback((deadline) => {
            this.#hasLowPriorityCallback = false;
            this.#runLowPriorityJobs(deadline);
        }, {
            timeout: IDLE_TIMEOUT_MS
        });
    }

    #runLowPriorityJobs(deadline: IdleDeadline) {
        const set = this.#getScheduleSet(Priority.low);

        const getTimeRemaining = deadline.timeRemaining.bind(deadline);

        for (const job of set) {
            const {fn} = this.#jobs.get(job);

            set.delete(job);

            fn({
                getTimeRemaining
            });

            if (deadline.timeRemaining() < IDLE_EARLY_END_MS) {
                break;
            }
        }
    }

    #runDebouncedJobs() {
        const set = this.#getScheduleSet(Priority.debounce);
        const cutoff = performance.now() - DEBOUNCE_PERIOD_MS;

        for (const job of set) {
            const lastScheduledTime = this.#lastScheduleTimes.get(job);
            if (lastScheduledTime && lastScheduledTime > cutoff) continue;

            set.delete(job);

            const {fn} = this.#jobs.get(job);

            fn({
                getTimeRemaining: returnInfinity
            });
        }
    }

    #getSupportedPriority(priority: Priority) {
        if (priority === Priority.low && !this.#supportsRequestIdleCallback) {
            return Priority.debounce;
        } else {
            return priority;
        }
    }
}
