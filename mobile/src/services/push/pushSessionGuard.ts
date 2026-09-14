let generation = 0;
let inflightAbort: AbortController | null = null;

function replaceAbortController(): AbortSignal {
  inflightAbort?.abort();
  inflightAbort = new AbortController();
  return inflightAbort.signal;
}

export function getPushSessionGeneration(): number {
  return generation;
}

export function bumpPushSessionGeneration(): number {
  generation += 1;
  replaceAbortController();
  return generation;
}

export function getPushRegistrationAbortSignal(): AbortSignal {
  if (!inflightAbort) inflightAbort = new AbortController();
  return inflightAbort.signal;
}

export function isPushSessionCurrent(expectedGeneration: number): boolean {
  return generation === expectedGeneration;
}

export function __resetPushSessionGenerationForTests(): void {
  generation = 0;
  inflightAbort?.abort();
  inflightAbort = new AbortController();
}
