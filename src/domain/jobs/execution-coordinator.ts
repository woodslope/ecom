export const DEFAULT_EXECUTION_JOB_LOCK_NAME = "ecom-workbench.execution-job";

export type ExecutionLockResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export interface ExecutionJobCoordinator {
  runExclusive<T>(
    operation: () => Promise<T>,
    options?: { wait?: boolean; ownerId?: string; onCancel?: () => void },
  ): Promise<ExecutionLockResult<T>>;
  isLocked(): Promise<boolean>;
  activeOwnerId(): Promise<string | null>;
  requestCancellation(ownerId: string): void;
}

export function createMemoryExecutionJobCoordinator(): ExecutionJobCoordinator {
  let held = false;
  let ownerId: string | null = null;
  let cancelOwner: (() => void) | null = null;
  const waiters: Array<() => void> = [];

  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else held = false;
  };

  return {
    async runExclusive(operation, options = {}) {
      if (held) {
        if (!options.wait) return { acquired: false };
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      } else {
        held = true;
      }
      ownerId = options.ownerId ?? null;
      cancelOwner = options.onCancel ?? null;

      try {
        return { acquired: true, value: await operation() };
      } finally {
        ownerId = null;
        cancelOwner = null;
        release();
      }
    },

    async isLocked() {
      return held;
    },

    async activeOwnerId() {
      return ownerId;
    },

    requestCancellation(targetOwnerId) {
      if (ownerId === targetOwnerId) cancelOwner?.();
    },
  };
}

export function createBrowserExecutionJobCoordinator(
  lockManager: LockManager,
  lockName = DEFAULT_EXECUTION_JOB_LOCK_NAME,
): ExecutionJobCoordinator {
  let locallyHeld = false;
  let localOwnerId: string | null = null;
  const ownerLockPrefix = `${lockName}:owner:`;
  const cancellationChannel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(`${lockName}:cancellation`)
    : null;

  const runWithOwner = async <T>(
    operation: () => Promise<T>,
    ownerId?: string,
    onCancel?: () => void,
  ): Promise<T> => {
    localOwnerId = ownerId ?? null;
    const handleCancellation = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        ownerId &&
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        "ownerId" in message &&
        message.type === "cancel" &&
        message.ownerId === ownerId
      ) {
        onCancel?.();
      }
    };
    cancellationChannel?.addEventListener("message", handleCancellation);
    try {
      return ownerId
        ? await lockManager.request(`${ownerLockPrefix}${ownerId}`, { mode: "exclusive" }, operation)
        : await operation();
    } finally {
      cancellationChannel?.removeEventListener("message", handleCancellation);
      localOwnerId = null;
    }
  };

  return {
    async runExclusive(operation, options = {}) {
      if (options.wait) {
        return lockManager.request(lockName, { mode: "exclusive" }, async () => {
          locallyHeld = true;
          try {
            return {
              acquired: true as const,
              value: await runWithOwner(operation, options.ownerId, options.onCancel),
            };
          } finally {
            locallyHeld = false;
          }
        });
      }

      return lockManager.request(
        lockName,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) return { acquired: false as const };
          locallyHeld = true;
          try {
            return {
              acquired: true as const,
              value: await runWithOwner(operation, options.ownerId, options.onCancel),
            };
          } finally {
            locallyHeld = false;
          }
        },
      );
    },

    async isLocked() {
      try {
        const snapshot = await lockManager.query();
        return snapshot.held?.some((lock) => lock.name === lockName) ?? false;
      } catch {
        return locallyHeld;
      }
    },

    async activeOwnerId() {
      try {
        const snapshot = await lockManager.query();
        const ownerLockName = snapshot.held
          ?.map((lock) => lock.name)
          .find((name): name is string => Boolean(name?.startsWith(ownerLockPrefix)));
        return ownerLockName ? ownerLockName.slice(ownerLockPrefix.length) : null;
      } catch {
        return localOwnerId;
      }
    },

    requestCancellation(ownerId) {
      cancellationChannel?.postMessage({ type: "cancel", ownerId });
    },
  };
}
