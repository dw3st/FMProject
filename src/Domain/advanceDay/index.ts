export { addOneDay } from "@/Domain/advanceDay/date";
export {
  buildMatchEvent,
  buildMatchEventFromRecording,
  buildQuickMatchEvent,
  type MatchSimResult,
  type PlayedMatchRecording,
} from "@/Domain/advanceDay/matches";
export { resolveSimMode, MAX_FOLLOWED_LEAGUES, type SimMode } from "@/Domain/advanceDay/simMode";
export {
  autoLineupDefaultFormation,
  computeMatchSimulationLineups,
} from "@/Domain/advanceDay/matchSimulationLineups";
export {
  buildTrainingEvent,
  resolveTrainingPolicy,
  type TrainingMetaSlice,
  type TrainingResult,
} from "@/Domain/advanceDay/dailyTraining";
export { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
export { computeAdvanceDayMoneyDelta, resolvePlayerSquadId } from "@/Domain/advanceDay/financial";
export {
  buildRestEvent,
  rollRestOutcome,
  type RestResult,
  type RestOutcome,
} from "@/Domain/advanceDay/dailyRest";
