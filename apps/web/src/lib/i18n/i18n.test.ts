// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from 'vitest';
import { translations } from './dictionaries';

describe('dictionary parity', () => {
  it('de and en dictionaries have exactly the same keys', () => {
    const deKeys = new Set(Object.keys(translations.de));
    const enKeys = new Set(Object.keys(translations.en));
    const missingInEn = [...deKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInDe = [...enKeys].filter((k) => !deKeys.has(k)).sort();
    expect(missingInEn).toEqual([]);
    expect(missingInDe).toEqual([]);
  });
});
