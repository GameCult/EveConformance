# EveConformance

EveConformance owns the cross-repository evidence that an Eve provider, plugin,
or runtime obeys the contracts published by the Eve kernel.

Eve owns schemas and the browser reference lowerer. Provider repos own live
state and scenarios. Plugin repos own semantic sidecars. Runtime repos own
native projection and captures. This repo reads those public surfaces and emits
portable parity reports and conformance packs; it does not import their private
implementation bodies.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-conformance.ps1
```

The checked-in `conformance-workspace.lock.json` pins every owner repository to
an immutable public Git commit. Materialize that evidence set, then run it:

```powershell
$workspace = powershell -ExecutionPolicy Bypass -File .\scripts\materialize-workspace.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-conformance.ps1 -WorkspaceRoot $workspace
```

For development, `-WorkspaceRoot E:\Projects` verifies sibling checkouts only
when every checkout already matches the lock. Local branch state is never
accepted as released conformance evidence.
