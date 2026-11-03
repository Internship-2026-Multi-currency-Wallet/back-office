import { sameValue, settingCopy, validateSettingValue } from './settingValue';

describe('validateSettingValue', () => {
  it('accepts only booleans for BOOLEAN', () => {
    const rules = { type: 'BOOLEAN', allowedValues: null } as const;
    expect(validateSettingValue(rules, false)).toBeNull();
    expect(validateSettingValue(rules, 'true')).toMatch(/on or off/);
  });

  it('accepts only allowed values for ENUM', () => {
    const rules = { type: 'ENUM' as const, allowedValues: ['signup', 'never'] };
    expect(validateSettingValue(rules, 'never')).toBeNull();
    expect(validateSettingValue(rules, 'sometimes')).toBe('Must be one of: signup, never.');
  });

  it('accepts a list of unique, non-empty strings for STRING_LIST', () => {
    const rules = { type: 'STRING_LIST', allowedValues: null } as const;
    expect(validateSettingValue(rules, [])).toBeNull();
    expect(validateSettingValue(rules, ['wallet', 'exchange'])).toBeNull();
    expect(validateSettingValue(rules, ['wallet', 1])).toMatch(/list of text/);
    expect(validateSettingValue(rules, ['wallet', ' '])).toMatch(/empty/);
    expect(validateSettingValue(rules, ['wallet', 'wallet'])).toMatch(/unique/);
  });
});

describe('sameValue', () => {
  it('compares JSON values deeply', () => {
    expect(sameValue(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameValue(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameValue(true, true)).toBe(true);
  });
});

describe('settingCopy', () => {
  it('falls back to the key for settings without copy', () => {
    expect(settingCopy('auth.googleLogin').name).toBe('Google sign-in');
    expect(settingCopy('new.setting')).toEqual({ name: 'new.setting' });
  });
});
