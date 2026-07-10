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

The default workspace assumes sibling repositories under `E:\Projects`. Set
`EVE_KERNEL_ROOT` when the Eve checkout lives elsewhere.

