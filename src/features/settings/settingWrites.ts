import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../app/store';
import { nextMoment, type SettingsSnapshot, settingsApi, type StaffSetting } from './settingsApi';
import { settingCopy } from './settingValue';

export interface SettingState {
  value: unknown;
  overridden: boolean;
}

interface Intent extends SettingState {
  id: number;
}

interface KeyWrites {
  intents: Intent[];
  latest: number;
  confirmed?: SettingState & { at: number };
  uncertainSince?: number;
}

export type SaveOutcome =
  | { id: number; status: 'saved'; previous?: SettingState }
  | { id: number; status: 'rejected' | 'uncertain'; message: string };

export interface SettingNotice {
  id: number;
  key: string;
  severity: 'success' | 'error';
  message: string;
  undo?: SaveOutcome;
}

interface WritesState {
  keys: Record<string, KeyWrites>;
  notice: SettingNotice | null;
}

const initialState: WritesState = { keys: {}, notice: null };

const slice = createSlice({
  name: 'settingWrites',
  initialState,
  reducers: {
    queued(state, { payload }: PayloadAction<{ key: string; intent: Intent }>) {
      const writes = (state.keys[payload.key] ??= { intents: [], latest: 0 });
      writes.intents.push(payload.intent);
      writes.latest = payload.intent.id;
      if (state.notice?.key === payload.key) state.notice = null;
    },
    settled(
      state,
      {
        payload,
      }: PayloadAction<{
        key: string;
        id: number;
        at: number;
        saved?: SettingState;
        uncertain?: boolean;
      }>,
    ) {
      const writes = state.keys[payload.key];
      if (!writes) return;
      writes.intents = writes.intents.filter((intent) => intent.id !== payload.id);
      if (payload.saved) {
        writes.confirmed = { ...payload.saved, at: payload.at };
        delete writes.uncertainSince;
      }
      if (payload.uncertain) writes.uncertainSince = payload.at;
    },
    noticeShown(state, { payload }: PayloadAction<SettingNotice>) {
      state.notice = payload;
    },
    noticeClosed(state, { payload }: PayloadAction<number>) {
      if (state.notice?.id === payload) state.notice = null;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(settingsApi.endpoints.staffSettings.matchFulfilled, (state, { payload }) => {
      for (const writes of Object.values(state.keys)) {
        if (writes.confirmed && writes.confirmed.at < payload.observedAt) delete writes.confirmed;
        if (writes.uncertainSince !== undefined && writes.uncertainSince < payload.observedAt) {
          delete writes.uncertainSince;
        }
      }
    });
  },
});

export const settingWritesReducer = slice.reducer;
export const { noticeClosed } = slice.actions;
const { queued, settled, noticeShown } = slice.actions;

let lastNoticeId = 0;

export function showSettingNotice(notice: Omit<SettingNotice, 'id'>) {
  return noticeShown({ ...notice, id: ++lastNoticeId });
}

const pick = ({ value, overridden }: SettingState): SettingState => ({ value, overridden });

const selectSnapshot = settingsApi.endpoints.staffSettings.select();
type ApiState = Parameters<typeof selectSnapshot>[0];
const snapshotOf = (state: RootState) => selectSnapshot(state as unknown as ApiState).data;

function serverStateOf(state: RootState, key: string): SettingState | undefined {
  const writes = state.settingWrites.keys[key];
  if (writes?.uncertainSince !== undefined) return undefined;
  const snapshot = snapshotOf(state);
  const confirmed = writes?.confirmed;
  if (confirmed && (!snapshot || confirmed.at > snapshot.observedAt)) return pick(confirmed);
  const row = snapshot?.rows.find((setting) => setting.key === key);
  return row && pick(row);
}

export interface DisplayedSetting extends StaffSetting {
  saving: boolean;
}

export function displayedSettings(
  snapshot: SettingsSnapshot,
  writes: WritesState,
): DisplayedSetting[] {
  return snapshot.rows.map((row) => {
    const keyWrites = writes.keys[row.key];
    const intent = keyWrites?.intents.at(-1);
    const confirmed =
      keyWrites?.confirmed && keyWrites.confirmed.at > snapshot.observedAt
        ? keyWrites.confirmed
        : undefined;
    return { ...row, ...pick(intent ?? confirmed ?? row), saving: intent !== undefined };
  });
}

type Thunk<T> = (dispatch: AppDispatch, getState: () => RootState) => T;

type SaveKind = 'change' | 'reset' | 'undo';

const REJECTIONS = new Set(['INVALID_VALUE', 'UNKNOWN_KEY', 'FORBIDDEN', 'UNAUTHENTICATED']);

const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
let lastIntentId = 0;

export function saveSetting(
  key: string,
  next: SettingState,
  kind: SaveKind = next.overridden ? 'change' : 'reset',
): Thunk<Promise<SaveOutcome>> {
  return (dispatch, getState) => {
    const id = ++lastIntentId;
    dispatch(queued({ key, intent: { id, ...pick(next) } }));
    let keys = queues.get(getState);
    if (!keys) queues.set(getState, (keys = new Map()));
    const run = (keys.get(key) ?? Promise.resolve())
      .then(() => send(dispatch, getState, key, id, next))
      .then((outcome) => {
        report(dispatch, getState, key, outcome, kind);
        return outcome;
      });
    keys.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  };
}

export function undoSetting(
  key: string,
  outcome: SaveOutcome,
): Thunk<Promise<SaveOutcome> | undefined> {
  return (dispatch, getState) => {
    if (outcome.status !== 'saved' || !outcome.previous) return undefined;
    if (getState().settingWrites.keys[key]?.latest !== outcome.id) return undefined;
    return dispatch(saveSetting(key, outcome.previous, 'undo'));
  };
}

function report(
  dispatch: AppDispatch,
  getState: () => RootState,
  key: string,
  outcome: SaveOutcome,
  kind: SaveKind,
): void {
  if (getState().settingWrites.keys[key]?.latest !== outcome.id) return;
  const name = settingCopy(key).name;
  if (outcome.status === 'saved') {
    const message = {
      change: `${name} saved`,
      reset: `${name} is back to default`,
      undo: `${name}: change undone`,
    }[kind];
    const undo = kind !== 'undo' && outcome.previous ? outcome : undefined;
    dispatch(showSettingNotice({ key, severity: 'success', message, undo }));
    return;
  }
  const message =
    outcome.status === 'rejected'
      ? `${name} was not saved: ${outcome.message}`
      : `${name} was not confirmed: ${outcome.message}. Reloading settings…`;
  dispatch(showSettingNotice({ key, severity: 'error', message }));
}

async function refresh(dispatch: AppDispatch): Promise<void> {
  await dispatch(settingsApi.util.getRunningQueryThunk('staffSettings', undefined));
  await dispatch(
    settingsApi.endpoints.staffSettings.initiate(undefined, {
      forceRefetch: true,
      subscribe: false,
    }),
  );
}

async function send(
  dispatch: AppDispatch,
  getState: () => RootState,
  key: string,
  id: number,
  next: SettingState,
): Promise<SaveOutcome> {
  let previous = serverStateOf(getState(), key);
  if (!previous) {
    await refresh(dispatch);
    previous = serverStateOf(getState(), key);
  }

  const request = next.overridden
    ? dispatch(settingsApi.endpoints.updateSetting.initiate({ key, value: next.value }))
    : dispatch(settingsApi.endpoints.resetSetting.initiate(key));
  const result = await request;
  request.reset();
  const at = nextMoment();

  if (result.data) {
    dispatch(settled({ key, id, at, saved: pick(result.data) }));
    return { id, status: 'saved', previous };
  }
  const code = result.error && 'code' in result.error ? result.error.code : undefined;
  const uncertain = !REJECTIONS.has(code ?? '');
  dispatch(settled({ key, id, at, uncertain }));
  if (uncertain) void refresh(dispatch);
  return {
    id,
    status: uncertain ? 'uncertain' : 'rejected',
    message: result.error?.message ?? 'unknown error',
  };
}
