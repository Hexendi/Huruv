export const UNDO_MESSAGE = 'arabictype:undo' as const;

export interface UndoRequestMessage {
  type: typeof UNDO_MESSAGE;
}

export interface UndoResponse {
  ok: boolean;
}
