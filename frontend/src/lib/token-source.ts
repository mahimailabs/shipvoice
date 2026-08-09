import { TokenSource } from "livekit-client";

export const tokenSource = TokenSource.endpoint(
  import.meta.env.VITE_TOKEN_ENDPOINT ?? "http://localhost:8000/api/v1/token",
);

export const AGENT_NAME = import.meta.env.VITE_AGENT_NAME ?? "assistant";
