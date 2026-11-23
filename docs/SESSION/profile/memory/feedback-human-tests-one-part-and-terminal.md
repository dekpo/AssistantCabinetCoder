---
name: feedback-human-tests-one-part-and-terminal
description: "How to hand a human test to the owner in chat: one part at a time, and always name the terminal to use"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32696030-fab9-4df6-8b4b-1cdbde4f2c29
  modified: 2026-10-27T14:56:11.168Z
---

When giving the owner a human test in the chat, give **one part at a time** (never the whole script), and write at the very top of each part **which terminal to use**, in plain words (for example "Terminal : Git Bash"). The next part is given only after the owner has pasted the output of the previous one.

**Why:** On 27 October 2026 the owner received the six parts of the Lot X0 test in one message; the chat window became too long, and it was not clear which terminal to run the commands in (the only terminals available to the owner are Git Bash and cmd).

**How to apply:** Default is Git Bash (see the global rule). Say it explicitly every time, even when it is Git Bash; if a step truly needs cmd, say "Terminal : cmd" for that step only. Applies to every project and every human test. Written in French in the chat; the test files in the repository stay English and should also name the terminal at the top of each part.
