export function createVolumeSelectionController({ delay, persistVolume, recordSelection }) {
  let writeTimer = null;
  let pendingWrite = null;
  let pendingSelection = null;

  const persistPendingVolume = () => {
    if (pendingWrite === null) return;
    persistVolume(pendingWrite);
    pendingWrite = null;
  };

  const commit = () => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }

    persistPendingVolume();

    if (pendingSelection !== null) {
      recordSelection(pendingSelection);
      pendingSelection = null;
    }
  };

  return {
    change(volume) {
      pendingWrite = volume;
      pendingSelection = volume;

      if (writeTimer) {
        clearTimeout(writeTimer);
      }

      writeTimer = setTimeout(() => {
        writeTimer = null;
        persistPendingVolume();
      }, delay);
    },
    commit,
    dispose: commit,
  };
}
