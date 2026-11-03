import type { SettingChange, StaffSetting } from '../features/settings/settingsApi';

type CatalogEntry = Omit<StaffSetting, 'value' | 'overridden'>;

const catalog: CatalogEntry[] = [
  {
    key: 'auth.googleLogin',
    type: 'BOOLEAN',
    allowedValues: null,
    public: true,
    defaultValue: true,
  },
  {
    key: 'auth.phoneRequiredAt',
    type: 'ENUM',
    allowedValues: ['signup', 'firstTransfer', 'never'],
    public: true,
    defaultValue: 'never',
  },
  {
    key: 'products.enabled',
    type: 'STRING_LIST',
    allowedValues: null,
    public: true,
    defaultValue: ['wallet'],
  },
];

let overrides: Map<string, unknown>;
let history: SettingChange[];

export class MockSettingsError extends Error {
  readonly code: 'UNKNOWN_KEY' | 'INVALID_VALUE';

  constructor(code: MockSettingsError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function resetMockSettings(): void {
  overrides = new Map<string, unknown>([
    ['auth.phoneRequiredAt', 'firstTransfer'],
    ['products.enabled', ['wallet', 'exchange']],
  ]);
  const change = (
    id: number,
    key: string,
    oldValue: unknown,
    newValue: unknown,
    by: string,
    at: string,
  ) => ({
    id: String(id),
    key,
    oldValue,
    newValue,
    changedBy: by,
    changedAt: at,
  });
  history = [
    change(
      5,
      'products.enabled',
      ['wallet'],
      ['wallet', 'exchange'],
      '101',
      '2026-11-01T09:12:00.000Z',
    ),
    change(4, 'auth.phoneRequiredAt', 'signup', 'firstTransfer', '100', '2026-10-29T15:40:00.000Z'),
    change(3, 'auth.phoneRequiredAt', 'never', 'signup', '101', '2026-10-25T08:05:00.000Z'),
    change(2, 'auth.googleLogin', false, true, '100', '2026-10-22T11:30:00.000Z'),
    change(1, 'auth.googleLogin', true, false, '104', '2026-10-20T17:55:00.000Z'),
  ];
}
resetMockSettings();

const typeOf = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

function backendIssue(setting: CatalogEntry, value: unknown): string | null {
  switch (setting.type) {
    case 'BOOLEAN':
      return typeof value === 'boolean'
        ? null
        : `Invalid input: expected boolean, received ${typeOf(value)}`;
    case 'ENUM': {
      const options = setting.allowedValues ?? [];
      return typeof value === 'string' && options.includes(value)
        ? null
        : `Invalid option: expected one of ${options.map((option) => `"${option}"`).join('|')}`;
    }
    case 'STRING_LIST': {
      if (!Array.isArray(value)) return `Invalid input: expected array, received ${typeOf(value)}`;
      const wrong = value.find((item) => typeof item !== 'string');
      return wrong === undefined
        ? null
        : `Invalid input: expected string, received ${typeOf(wrong)}`;
    }
  }
}

function entry(key: string): CatalogEntry {
  const found = catalog.find((setting) => setting.key === key);
  if (!found) throw new MockSettingsError('UNKNOWN_KEY', `Unknown setting "${key}"`);
  return found;
}

function effective(setting: CatalogEntry): StaffSetting {
  const overridden = overrides.has(setting.key);
  return {
    ...setting,
    value: structuredClone(overridden ? overrides.get(setting.key) : setting.defaultValue),
    overridden,
  };
}

function record(key: string, oldValue: unknown, newValue: unknown, changedBy: string): void {
  const id = String(Math.max(0, ...history.map((change) => Number(change.id))) + 1);
  history.unshift({ id, key, oldValue, newValue, changedBy, changedAt: new Date().toISOString() });
}

export const mockSettings = {
  list: (): StaffSetting[] => catalog.map(effective),

  seedHistory(changes: SettingChange[]): void {
    history = changes;
  },

  update(key: string, value: unknown, changedBy: string): StaffSetting {
    const setting = entry(key);
    const problem = backendIssue(setting, value);
    if (problem)
      throw new MockSettingsError('INVALID_VALUE', `Invalid value for "${key}": ${problem}`);
    record(key, effective(setting).value, value, changedBy);
    overrides.set(key, structuredClone(value));
    return effective(setting);
  },

  reset(key: string, changedBy: string): StaffSetting {
    const setting = entry(key);
    if (overrides.has(key)) {
      record(key, overrides.get(key), setting.defaultValue, changedBy);
      overrides.delete(key);
    }
    return effective(setting);
  },

  history(query: {
    key?: string | null;
    limit: number;
    before?: string | null;
    beforeId?: string | null;
  }) {
    if (query.key) entry(query.key);
    const older = (change: SettingChange) =>
      !query.before ||
      change.changedAt < query.before ||
      (query.beforeId != null &&
        change.changedAt === query.before &&
        Number(change.id) < Number(query.beforeId));
    return history
      .filter((change) => (!query.key || change.key === query.key) && older(change))
      .slice(0, query.limit);
  },
};
