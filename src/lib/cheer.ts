// "Something good just happened" — a step ticked, a task done, a check-in, a new level. The garden's
// creatures hop about when they hear it. Never fired for anything missed or undone.
export const CHEER_EVENT = "tend:cheer";
export const cheer = () => window.dispatchEvent(new Event(CHEER_EVENT));
