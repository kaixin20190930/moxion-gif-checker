export function compareTarget(actual, value, multiplier = 1) {
  if (value.trim() === '') return { status: 'unset' };
  if (!/^[0-9]+$/.test(value.trim())) return { status: 'invalid' };
  const number = Number(value);
  const limit = number * multiplier;
  if (!Number.isSafeInteger(number) || number <= 0 || !Number.isSafeInteger(limit)) {
    return { status: 'invalid' };
  }
  return { status: actual <= limit ? 'pass' : 'fail', limit, delta: actual - limit };
}

export function loopLabel(loopCount) {
  if (loopCount === null) return 'Unspecified (no loop declaration)';
  if (loopCount === 0) return 'Infinite';
  return `Finite (repeat count ${loopCount})`;
}
