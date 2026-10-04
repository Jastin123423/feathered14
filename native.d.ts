// native.d.ts

declare global {
  interface Window {
    UneraNative?: {
      postMessage: (message: string) => void;
    };
    UNERA_IS_NATIVE_APP?: boolean;
  }
}

export {};
