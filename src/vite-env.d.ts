/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket address of the online room server, e.g. wss://rooms.example.workers.dev */
  readonly VITE_ROOMS_URL?: string;
}
