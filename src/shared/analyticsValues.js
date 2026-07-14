export function normalizeVolumePercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const volume = Number(value);
  if (!Number.isFinite(volume)) return null;
  return Math.min(100, Math.max(0, Math.round(volume)));
}

export function getMuteState(isMuted) {
  return isMuted ? 'muted' : 'unmuted';
}

export function selectLatestActiveVolume(current, candidate) {
  const candidateVolume = normalizeVolumePercent(candidate?.volumePercent);
  const candidateUsedAt = Number(candidate?.usedAt);

  if (candidateVolume === null || !Number.isFinite(candidateUsedAt) || candidateUsedAt <= 0) {
    return current || null;
  }

  const currentUsedAt = Number(current?.usedAt);
  if (!Number.isFinite(currentUsedAt) || candidateUsedAt >= currentUsedAt) {
    return { volumePercent: candidateVolume, usedAt: candidateUsedAt };
  }

  return current;
}
