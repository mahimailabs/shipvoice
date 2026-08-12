import { TokenSource } from "livekit-client";
import { DEMO } from "@/demo/flag";

const ENDPOINT =
  import.meta.env.VITE_TOKEN_ENDPOINT ?? "http://localhost:8000/api/v1/token";

/**
 * Where a test call gets its LiveKit credentials.
 *
 * The preview refuses instead of pointing at an endpoint, and it has to:
 * useSession warms the connection the moment the test call screen mounts, so a
 * visitor who merely opens that page would put a POST on the wire from a static
 * page nobody is serving a token from. A custom source keeps the screen
 * renderable, keeps the network silent, and says what is missing if anything
 * ever does ask it for a token.
 */
export const tokenSource = DEMO
  ? TokenSource.custom(() => {
      throw new Error(
        "This preview does not issue LiveKit tokens. A test call runs against your own project, after you install.",
      );
    })
  : TokenSource.endpoint(ENDPOINT);

export const AGENT_NAME = import.meta.env.VITE_AGENT_NAME ?? "assistant";
