import { afterEach, describe, expect, it, vi } from 'vitest';

import { createVolumeSelectionController } from '../../src/pages/Popup/volumeSelectionController';

describe('volume selection controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists a paused slider value without counting it until the selection is committed', () => {
    vi.useFakeTimers();
    const persistVolume = vi.fn();
    const recordSelection = vi.fn();
    const controller = createVolumeSelectionController({
      delay: 250,
      persistVolume,
      recordSelection,
    });

    controller.change(35);
    vi.advanceTimersByTime(250);

    expect(persistVolume).toHaveBeenCalledOnce();
    expect(persistVolume).toHaveBeenCalledWith(35);
    expect(recordSelection).not.toHaveBeenCalled();

    controller.commit();

    expect(persistVolume).toHaveBeenCalledOnce();
    expect(recordSelection).toHaveBeenCalledOnce();
    expect(recordSelection).toHaveBeenCalledWith(35);
  });

  it('commits the final value once when interaction ends before the debounce', () => {
    vi.useFakeTimers();
    const persistVolume = vi.fn();
    const recordSelection = vi.fn();
    const controller = createVolumeSelectionController({
      delay: 250,
      persistVolume,
      recordSelection,
    });

    controller.change(70);
    controller.commit();
    vi.advanceTimersByTime(250);

    expect(persistVolume).toHaveBeenCalledOnce();
    expect(persistVolume).toHaveBeenCalledWith(70);
    expect(recordSelection).toHaveBeenCalledOnce();
    expect(recordSelection).toHaveBeenCalledWith(70);
  });
});
