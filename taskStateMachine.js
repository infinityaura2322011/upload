"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStateMachine = void 0;
const TRANSITIONS = {
    IDLE: ["ANALYZING", "CANCELLED"],
    ANALYZING: ["PLANNING", "FAILED", "CANCELLED"],
    PLANNING: ["CONTEXT_GATHERING", "WAITING_FOR_APPROVAL", "FAILED", "CANCELLED"],
    CONTEXT_GATHERING: ["IMPLEMENTING", "FAILED", "CANCELLED"],
    IMPLEMENTING: ["ENGINEERING_REVIEW", "FAILED", "CANCELLED"],
    ENGINEERING_REVIEW: ["REFACTORING", "DEBUGGING", "FAILED", "CANCELLED"],
    REFACTORING: ["ENGINEERING_REVIEW", "WAITING_FOR_APPROVAL", "FAILED", "CANCELLED"],
    DEBUGGING: ["TEST_GENERATION", "FIXING", "FAILED", "CANCELLED"],
    TEST_GENERATION: ["TESTING", "FAILED", "CANCELLED"],
    TESTING: ["BUILDING", "FIXING", "FAILED", "CANCELLED"],
    BUILDING: ["FINAL_REVIEW", "FIXING", "FAILED", "CANCELLED"],
    FIXING: ["DEBUGGING", "TESTING", "BUILDING", "IMPLEMENTING", "FAILED", "CANCELLED"],
    FINAL_REVIEW: ["WAITING_FOR_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"],
    WAITING_FOR_APPROVAL: ["IMPLEMENTING", "COMPLETED", "CANCELLED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
};
class TaskStateMachine {
    taskId;
    persist;
    state = "IDLE";
    constructor(taskId, persist) {
        this.taskId = taskId;
        this.persist = persist;
    }
    get current() { return this.state; }
    async transition(to, note) {
        if (!TRANSITIONS[this.state].includes(to)) {
            throw new Error(`Illegal transition ${this.state} → ${to} for task ${this.taskId}`);
        }
        const from = this.state;
        this.state = to;
        await this.persist(from, to, note);
    }
    isTerminal() { return TRANSITIONS[this.state].length === 0; }
}
exports.TaskStateMachine = TaskStateMachine;
