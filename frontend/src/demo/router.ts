import { BrowserRouter, HashRouter } from "react-router";
import { DEMO } from "./flag";

/**
 * How the console addresses its own pages.
 *
 * The preview is served as a plain directory on a static host with no rewrite
 * rules, so a deep link to /demo/calls would 404 and so would a refresh. The
 * hash keeps the whole route on the client and needs nothing from the server.
 * The normal build owns its origin, so it keeps clean paths.
 */
export const Router = DEMO ? HashRouter : BrowserRouter;
