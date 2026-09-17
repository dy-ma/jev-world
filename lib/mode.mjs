export function isReplayOnly(env = process.env) {
  const value = env.REPLAY_ONLY ?? 'false';
  if (value !== 'true' && value !== 'false') throw new Error('REPLAY_ONLY must be true or false.');
  return value === 'true';
}

export function buildMode(env = process.env) {
  const replayOnly = isReplayOnly(env);
  if (env.VERCEL && !replayOnly) throw new Error('Vercel deployments require REPLAY_ONLY=true. Live generation is local-only.');
  return replayOnly ? 'replay' : 'live';
}
