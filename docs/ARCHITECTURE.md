# Architecture (stub, completed lot by lot)

Nothing of the real extension exists yet. Lot X0 only adds the throw-away probe in `spike/`, deleted at the end of Lot X1b. The planned modules, one job each, all under `src/`:

- `platform`: the only module that names operating-system folders.
- `discovery`: finds the server (reads `server.env` on the server's machine, or the configured URL).
- `transport`: HTTP and HTTPS calls with the authority file, timeouts.
- `sse`: parser of the server-sent event stream.
- `client`: typed calls to `/health` and `/ide/v1`.
- `convert`: translation between VS Code chat messages and the server's chat format, in both directions.
- `provider`: the language model chat provider registered with VS Code.
- `tools`: the model-facing tools (`cabinet_read_document`, `cabinet_view_image`).
- `agents`: the shipped agents and the sync of the server's catalogue into `.github/agents/`.
- `log`: the content-free output channel (codes, durations, counts).
- `messages`: every user-facing string.
- `extension`: the thin VS Code adapter that wires the modules together.

The data flow of one chat request and the "where to add a feature" section are written by Lot X1b.
