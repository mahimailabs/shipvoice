# CLAUDE.md

Read `AGENTS.md` in this directory. It is the contract for this repo and it is
the only one: this file exists because Claude Code looks for this name, and
duplicating the content here would guarantee the two drift apart.

@AGENTS.md

## Setup

`/setup` walks a new clone to a talking agent. It asks what the agent should
be, writes the persona, brings the stack up, and runs the doctor.

You will be asked to paste three API keys into `.env` yourself. That is not
friction for its own sake: anything typed into this conversation is written to
the Claude Code transcript on disk, so keys must not pass through it.
