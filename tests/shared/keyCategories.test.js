import { describe, expect, it } from 'vitest';

import { getKeyPlaybackInfo, getPlaybackCandidates } from '../../src/shared/keyCategories';

describe('key playback categorization', () => {
  it.each([
    ['space key', { key: ' ', code: 'Space' }, { playbackKey: ' ', keyCategory: 'space' }],
    ['enter key', { key: 'Enter', code: 'Enter' }, { playbackKey: 'Enter', keyCategory: 'enter' }],
    [
      'backspace key',
      { key: 'Backspace', code: 'Backspace' },
      { playbackKey: 'Backspace', keyCategory: 'backspace' },
    ],
    [
      'delete key',
      { key: 'Delete', code: 'Delete' },
      { playbackKey: 'Delete', keyCategory: 'delete' },
    ],
    [
      'escape key',
      { key: 'Escape', code: 'Escape' },
      { playbackKey: 'Escape', keyCategory: 'escape' },
    ],
    [
      'arrow key',
      { key: 'ArrowLeft', code: 'ArrowLeft' },
      { playbackKey: 'ArrowLeft', keyCategory: 'arrow' },
    ],
    [
      'modifier key',
      { key: 'Shift', code: 'ShiftLeft' },
      { playbackKey: 'Shift', keyCategory: 'modifier' },
    ],
    [
      'navigation key',
      { key: 'Tab', code: 'Tab' },
      { playbackKey: 'Tab', keyCategory: 'navigation' },
    ],
    ['function key', { key: 'F12', code: 'F12' }, { playbackKey: 'F12', keyCategory: 'function' }],
    ['WASD letter', { key: 'w', code: 'KeyW' }, { playbackKey: '$wasd', keyCategory: 'wasd' }],
    [
      'non-WASD letter',
      { key: 'q', code: 'KeyQ' },
      { playbackKey: '$letter', keyCategory: 'letter' },
    ],
    [
      'digit number',
      { key: '1', code: 'Digit1' },
      { playbackKey: '$number', keyCategory: 'number' },
    ],
    [
      'numpad number',
      { key: '1', code: 'Numpad1' },
      { playbackKey: '$number', keyCategory: 'number' },
    ],
    [
      'punctuation key',
      { key: ',', code: 'Comma' },
      { playbackKey: '$punctuation', keyCategory: 'punctuation' },
    ],
    [
      'unmapped media key',
      { key: 'AudioVolumeUp', code: 'AudioVolumeUp' },
      { playbackKey: 'default', keyCategory: 'other' },
    ],
  ])('maps %s', (_name, event, expected) => {
    expect(getKeyPlaybackInfo(event)).toMatchObject(expected);
  });

  it('preserves keyboard location for playback decisions', () => {
    expect(getKeyPlaybackInfo({ key: 'Shift', code: 'ShiftRight', location: 2 })).toEqual({
      playbackKey: 'Shift',
      keyCategory: 'modifier',
      location: 2,
    });
  });
});

describe('playback candidates', () => {
  it.each([
    [
      'WASD fallback',
      { playbackKey: '$wasd', keyCategory: 'wasd' },
      ['$wasd', '$letter', 'default'],
    ],
    ['letter fallback', { playbackKey: '$letter', keyCategory: 'letter' }, ['$letter', 'default']],
    ['number fallback', { playbackKey: '$number', keyCategory: 'number' }, ['$number', 'default']],
    [
      'delete fallback',
      { playbackKey: 'Delete', keyCategory: 'delete' },
      ['Delete', 'Backspace', 'default'],
    ],
    [
      'arrow fallback',
      { playbackKey: 'ArrowLeft', keyCategory: 'arrow' },
      ['ArrowLeft', '$arrow', '$navigation', 'default'],
    ],
    ['default fallback', { playbackKey: 'default', keyCategory: 'other' }, ['default']],
  ])('returns %s order', (_name, playbackInfo, expected) => {
    expect(getPlaybackCandidates(playbackInfo)).toEqual(expected);
  });
});
