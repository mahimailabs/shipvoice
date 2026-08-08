# Third-party notices

Some files in this repository were vendored from public component registries
using the shadcn CLI. They are copy-in source, they carry their upstream
authors' licences rather than this repository's MIT licence, and they have no
automatic update path.

The registries they came from are declared in
[`frontend/components.json`](frontend/components.json).

## shadcn/ui primitives

**Path:** `frontend/src/components/ui/`
**Files:** `button.tsx`, `button-group.tsx`, `input.tsx`, `select.tsx`,
`separator.tsx`, `toggle.tsx`, `tooltip.tsx`
**Source:** https://ui.shadcn.com
**Upstream:** https://github.com/shadcn-ui/ui
**Licence:** MIT

## Vercel AI Elements

**Path:** `frontend/src/components/ai-elements/`
**Files:** `conversation.tsx`, `message.tsx`
**Source:** https://registry.ai-sdk.dev
**Upstream:** https://github.com/vercel/ai-elements
**Licence:** Apache License 2.0, Copyright 2023 Vercel, Inc.

## LiveKit Agents UI

**Path:** `frontend/src/components/agents-ui/` and `frontend/src/hooks/agents-ui/`
**Files:** `agent-audio-visualizer-bar.tsx`, `agent-chat-indicator.tsx`,
`agent-chat-transcript.tsx`, `agent-control-bar.tsx`,
`agent-disconnect-button.tsx`, `agent-session-provider.tsx`,
`agent-track-control.tsx`, `agent-track-toggle.tsx`,
`use-agent-audio-visualizer-bar.ts`, `use-agent-control-bar.ts`
**Source:** https://livekit.com/ui/r/{name}.json
**Licence:** not declared.

The registry items served from `livekit.com/ui/r/` carry no licence field, and
there is no public source repository for them that we could identify. LiveKit's
adjacent projects (`livekit/components-js`, `livekit/agents`) are Apache 2.0,
but we are not asserting that licence for these files on that basis alone.

If you redistribute this repository and that matters to you, confirm the terms
with LiveKit directly.

## ShipVoice Pro screenshots

Images under `assets/` that depict ShipVoice Pro are included for comparison and
are not part of the MIT grant. See `LICENSE`.
