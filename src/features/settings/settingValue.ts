import type { StaffSetting } from './settingsApi';

const copy: Record<string, { name: string; description: string }> = {
  'auth.googleLogin': {
    name: 'Google sign-in',
    description: 'Users can sign up and log in with their Google account.',
  },
  'auth.phoneRequiredAt': {
    name: 'Phone number required',
    description:
      'When a user must add a phone number: at sign-up, before the first transfer or never.',
  },
  'products.enabled': {
    name: 'Enabled products',
    description: 'Products the wallet app shows to the users of this client.',
  },
};

export function settingCopy(key: string): { name: string; description?: string } {
  return copy[key] ?? { name: key };
}

type ValueRules = Pick<StaffSetting, 'type' | 'allowedValues'>;

export function validateSettingValue(setting: ValueRules, value: unknown): string | null {
  switch (setting.type) {
    case 'BOOLEAN':
      return typeof value === 'boolean' ? null : 'Must be on or off.';
    case 'ENUM':
      return typeof value === 'string' && (setting.allowedValues ?? []).includes(value)
        ? null
        : `Must be one of: ${(setting.allowedValues ?? []).join(', ')}.`;
    case 'STRING_LIST':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? null
        : 'Must be a list of text values.';
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
