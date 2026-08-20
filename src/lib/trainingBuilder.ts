import { LoggedSet } from "./trainingVolume";

export type ReserveType = LoggedSet["reserveType"];

export interface TrainingBlock {
  reserveType: ReserveType;
  sets: number;
  repRange: string;
  loadKg?: number | null;
  /** repetições em reserva alvo — quantas repetições sobrariam no tanque ao encerrar a série. O app
   * PERGUNTA se a pessoa chegou perto da falha (é critério de "ciclo limpo" da calibração) mas nunca
   * prescrevia o alvo; sem isso a pergunta cobra algo que não foi pedido. */
  rirTarget?: number | null;
}

export interface TrainingItem {
  exerciseId: string;
  blocks: TrainingBlock[];
}

export interface TrainingSession {
  label: string;
  items: TrainingItem[];
}

export interface TrainingProgram {
  id: string;
  name: string;
  createdAt: string;
  sessions: TrainingSession[];
}

export function newTrainingBlock(): TrainingBlock {
  return { reserveType: "work", sets: 3, repRange: "6-8", loadKg: null };
}

export function newTrainingItem(exerciseId: string): TrainingItem {
  return { exerciseId, blocks: [newTrainingBlock()] };
}

export function newTrainingSession(label: string): TrainingSession {
  return { label, items: [] };
}

/** achatado a partir de um TrainingSession pra virar o formato de log real (o que a pessoa efetivamente
 * fez naquela sessão) — ponto de partida editável, não obrigatório seguir à risca */
export function sessionToLoggedSets(session: TrainingSession): LoggedSetEntry[] {
  return session.items.flatMap((item) =>
    item.blocks.map((block) => ({
      exerciseId: item.exerciseId,
      sets: block.sets,
      reserveType: block.reserveType,
      repRange: block.repRange,
      loadKg: block.loadKg ?? null,
    }))
  );
}

/** um bloco logado de verdade — mesmo formato de LoggedSet (usado pro cômputo de volume em
 * trainingVolume.ts) mais os dados de execução real (rep range e carga), que o cômputo de volume ignora
 * mas a UI e o histórico precisam pra mostrar progressão de carga */
export interface LoggedSetEntry extends LoggedSet {
  repRange?: string;
  loadKg?: number | null;
}

export interface TrainingLog {
  id: string;
  userId?: string;
  programId?: string | null;
  date: string;
  sessionLabel: string;
  setsLogged: LoggedSetEntry[];
  injuryNote?: string | null;
  createdAt?: string;
}
