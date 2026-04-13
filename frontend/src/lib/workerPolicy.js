export const DEFAULT_WORKER_COUNT = 8;
export const AGGRESSIVE_WORKER_COUNT = 10;
export const ABSOLUTE_WORKER_CAP = 12;


export function workerProfileForLane(lane) {
  return lane === "digital-brain" ? "aggressive" : "default";
}


export function workerCountForProfile(profile) {
  return profile === "aggressive" ? AGGRESSIVE_WORKER_COUNT : DEFAULT_WORKER_COUNT;
}


export function workerCountForLane(lane) {
  return lane === "digital-brain" ? AGGRESSIVE_WORKER_COUNT : DEFAULT_WORKER_COUNT;
}
