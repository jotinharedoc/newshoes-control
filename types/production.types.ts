export type HygieneProductionStatus =
  | "IN_PROGRESS"
  | "PAUSED"
  | "DEFERRED";

export type HygieneProductionView = {
  id: string;
  code: string;
  processName: string;
  status: HygieneProductionStatus;
  version: number;
  startedAt: string;
  elapsedMilliseconds: number;
  observedAt: string;
};

export type HygieneOverview = {
  current: HygieneProductionView | null;
  deferred: HygieneProductionView[];
};

export type HygieneAction = "pause" | "resume" | "defer" | "continue" | "finish";

