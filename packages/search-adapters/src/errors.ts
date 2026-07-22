export const ERR_ADAPTER_UNSUPPORTED = "ERR_ADAPTER_UNSUPPORTED";

export class AdapterUnsupportedError extends Error {
  readonly code = ERR_ADAPTER_UNSUPPORTED;

  constructor(message: string) {
    super(message);
    this.name = "AdapterUnsupportedError";
  }
}

export function unsupported(feature: string, backend: string): never {
  throw new AdapterUnsupportedError(`${feature} is not supported by the ${backend} adapter`);
}
