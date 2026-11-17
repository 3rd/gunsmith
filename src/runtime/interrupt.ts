const INTERRUPT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

// Until the returned function runs, SIGINT and SIGTERM no longer terminate the process: the first
// one calls onInterrupt and later ones are ignored. Terminating on a later signal would cut short
// the cleanup a handler runs after its signal aborts, such as stopping detached child processes
// that would otherwise outlive the CLI.
export const interceptInterrupts = (onInterrupt: () => void) => {
  let hasInterrupted = false;

  const handleInterrupt = () => {
    if (hasInterrupted) return;

    hasInterrupted = true;
    onInterrupt();
  };

  for (const signal of INTERRUPT_SIGNALS) {
    process.on(signal, handleInterrupt);
  }

  return () => {
    for (const signal of INTERRUPT_SIGNALS) {
      process.off(signal, handleInterrupt);
    }
  };
};
