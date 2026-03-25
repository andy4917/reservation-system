let runtimeGlobalsQueue = Promise.resolve();

export function runWithRuntimeGlobalsExclusive<T>(factory: () => Promise<T>): Promise<T> {
  const next = runtimeGlobalsQueue.then(factory, factory);
  runtimeGlobalsQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
