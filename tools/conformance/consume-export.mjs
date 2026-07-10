import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const { exportDirectory, expectations } = parseArguments(process.argv.slice(2));
if (!exportDirectory) {
  console.error([
    "Usage: node tools/conformance/consume-export.mjs <export-directory> [expectations]",
    "",
    "Expectations:",
    "  --expect-pack <id>",
    "  --expect-fixture <id>",
    "  --expect-plugin <id>",
    "  --expect-provider <id>",
    "  --expect-runtime <id>",
    "  --expect-scenario <id>",
    "  --expect-split-target <id>",
    "  --expect-capability-matrix",
    "  --expect-schema <schemaId>",
    "  --expect-capability-gap <substring>",
    "  --expect-runtime-plugin-projection <runtimeId:pluginId:status:ownerRepo>",
    "  --expect-provider-runtime-plugin-projection <providerId:surfaceId:runtimeId:pluginId:status:runtimeOwnerRepo>",
    "  --expect-runtime-plugin-gap <runtimeId:pluginId:ownerRepo>",
    "  --expect-local-provider-catalog <runtimeId:status:path-substring>",
    "  --expect-local-provider-catalog-provider <runtimeId:providerId>",
    "  --expect-local-provider-catalog-advertisement <runtimeId:advertisement-path-substring>",
    "  --expect-world-lowering-coverage <providerId:surfaceId:targetId:status:ownerRepo:runtimeId>",
    "  --expect-command-boundary-coverage <providerId:surfaceId:targetId:status:ownerRepo:runtimeId>",
    "  --expect-world-lowering-gap <providerId:surfaceId:targetId:ownerRepo:runtimeId>",
    "  --expect-screenshot-metric <runtimeId:fixtureId:metricKind:status>",
    "  --expect-runtime-capture-probe <runtimeId:status:contractArtifactKind:captureOwnerRepo>",
    "  --expect-conformance-handoff",
    "  --expect-plugin-operation <pluginId:operation>",
    "  --expect-plugin-capability <pluginId:capability>",
    "  --expect-plugin-runtime <pluginId:invocationModel>",
    "  --expect-plugin-runtime-transport <pluginId:transport>",
    "  --expect-plugin-runtime-authority <pluginId:authority>",
    "  --expect-plugin-runtime-field <pluginId:field.path:value>",
    "  --expect-plugin-abi-field <pluginId:operation:field.path:value>",
    "  --expect-plugin-abi-operation-coverage <pluginId:operation:status:ownerRepo>",
    "  --expect-plugin-handoff <pluginId>",
    "  --expect-plugin-witness <pluginId:transport:status>",
    "  --expect-plugin-handoff-move <pluginId:moveSetId:pathKind:status:path-substring>",
    "  --expect-provider-handoff-move <providerId:moveSetId:pathKind:status:path-substring>",
    "  --expect-provider-surface <providerId:surfaceId>",
    "  --expect-provider-surface-kind <providerId:surfaceId:surfaceKind>",
    "  --expect-provider-surface-field <providerId:surfaceId:field.path:value>",
    "  --expect-interactive-world-surface <providerId:surfaceId:targetId:ownerRepo>",
    "  --expect-provider-plugin-requirement <providerId:surfaceId:pluginId:status:pluginOwnerRepo[:availability]>",
    "  --expect-independent-nested-plugin <providerId:surfaceId:parentPluginId:nestedPluginId:nestedOwnerRepo>",
    "  --expect-provider-command <providerId:command>",
    "  --expect-provider-receipt-state <providerId:state>",
    "  --expect-provider-handoff <providerId>",
    "  --expect-runtime-status <runtimeId:status>",
    "  --expect-runtime-feature <runtimeId:feature>",
    "  --expect-runtime-world-target <runtimeId:targetId>",
    "  --expect-runtime-world-field <runtimeId:targetId:field.path:value>",
    "  --expect-runtime-handoff <runtimeId>",
    "  --expect-runtime-command-schema <runtimeId:schema>",
    "  --expect-runtime-capture-status <runtimeId:status>",
    "  --expect-runtime-capture-artifact <runtimeId:kind:schema:providerId:surfaceId>",
    "  --expect-runtime-witness <runtimeId:providerId:surfaceId:cacheState:status>",
    "  --expect-runtime-lifecycle-status <runtimeId:stage:status>",
    "  --expect-runtime-lifecycle-pending <runtimeId:stage:pending-proof-substring>",
    "  --expect-runtime-lifecycle-field <runtimeId:stage:field.path:value>",
    "  --expect-split-target-status <targetId:status>",
    "  --expect-split-target-blocker <targetId:blocker-substring>",
    "  --expect-split-target-blocker-record <targetId:kind:subject>",
    "  --expect-split-handoff-move <splitTarget:runtimeId:moveSetId:pathKind:status:path-substring>",
    "  --expect-split-target-proof <targetId:proof-substring>",
  ].join("\n"));
  process.exit(2);
}

const indexPath = path.join(exportDirectory, "index.json");
const errors = [];

if (!existsSync(indexPath)) {
  errors.push(`index.json:missing:${indexPath}`);
} else {
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  validateIndex(index, exportDirectory, expectations, errors);
}

for (const error of errors) console.error(`Conformance consumer error: ${error}`);
if (errors.length) process.exit(1);

console.log(`Conformance consumer smoke passed: ${exportDirectory}`);

function validateIndex(index, directory, expectations, errors) {
  if (index.schema !== "gamecult.eve.conformance_export.v1") {
    errors.push(`schema:expected gamecult.eve.conformance_export.v1 got ${index.schema || ""}`);
  }

  const packs = Array.isArray(index.packs) ? index.packs : [];
  const packIds = new Set(packs.map(pack => pack.id));
  const fixtureIds = new Set();
  const exportedRuntimeTargets = [];
  validateSchemaCatalog(index.schemaCatalog, directory, expectations.schemas, errors);
  for (const requiredPack of ["core", "plugin", "provider", "runtime"]) {
    if (!packIds.has(requiredPack)) errors.push(`pack:${requiredPack}:missing`);
  }
  for (const expectedPack of expectations.packs) {
    if (!packIds.has(expectedPack)) errors.push(`pack:${expectedPack}:missing`);
  }

  for (const pack of packs) {
    const packPath = path.join(directory, "packs", `${pack.id}.json`);
    if (!existsSync(packPath)) {
      errors.push(`pack-file:${pack.id}:missing`);
      continue;
    }

    const packDocument = JSON.parse(readFileSyncUtf8(packPath));
    if (packDocument.id !== pack.id) {
      errors.push(`pack-file:${pack.id}:id:expected ${pack.id} got ${packDocument.id || ""}`);
    }
    if ((packDocument.fixtures || []).length !== (pack.fixtures || []).length) {
      errors.push(`pack-file:${pack.id}:fixture-count:expected ${(pack.fixtures || []).length} got ${(packDocument.fixtures || []).length}`);
    }

    for (const fixture of packDocument.fixtures || []) {
      if (fixture.fixtureId) fixtureIds.add(fixture.fixtureId);
      if (!fixture.fixtureId) errors.push(`pack-file:${pack.id}:fixture:fixtureId:missing`);
      if (!fixture.status) errors.push(`pack-file:${pack.id}:fixture:${fixture.fixtureId || "unknown"}:status:missing`);
      if (!fixture.surface?.path) errors.push(`pack-file:${pack.id}:fixture:${fixture.fixtureId || "unknown"}:surface.path:missing`);
      if (!fixture.metadataPath) errors.push(`pack-file:${pack.id}:fixture:${fixture.fixtureId || "unknown"}:metadataPath:missing`);
    }

    if (pack.id === "runtime") {
      const packRuntimeTargets = Array.isArray(packDocument.runtimeTargets) ? packDocument.runtimeTargets : [];
      if (!packRuntimeTargets.length) errors.push("pack-file:runtime:runtimeTargets:missing");
      for (const runtime of packRuntimeTargets) {
        exportedRuntimeTargets.push(runtime);
        if (!runtime.runtimeId) errors.push("pack-file:runtime:runtimeTarget:runtimeId:missing");
        if (!runtime.status) errors.push(`pack-file:runtime:runtimeTarget:${runtime.runtimeId || "unknown"}:status:missing`);
        if (!runtime.ownerRepo) errors.push(`pack-file:runtime:runtimeTarget:${runtime.runtimeId || "unknown"}:ownerRepo:missing`);
      }
    }
  }

  const plugins = Array.isArray(index.plugins) ? index.plugins : [];
  const pluginWitnesses = Array.isArray(index.pluginWitnesses) ? index.pluginWitnesses : [];
  const providers = Array.isArray(index.providers) ? index.providers : [];
  const runtimes = mergeRuntimeRecords(Array.isArray(index.runtimes) ? index.runtimes : [], exportedRuntimeTargets);
  const splitTargets = Array.isArray(index.splitTargets) ? index.splitTargets : [];
  const pluginAbiOperationCoverage = Array.isArray(index.pluginAbiOperationCoverage) ? index.pluginAbiOperationCoverage : [];
  const providerPluginRequirementCoverage = Array.isArray(index.providerPluginRequirementCoverage) ? index.providerPluginRequirementCoverage : [];
  const capabilityGaps = Array.isArray(index.capabilityGaps) ? index.capabilityGaps : [];
  const runtimePluginProjectionCoverage = Array.isArray(index.runtimePluginProjectionCoverage) ? index.runtimePluginProjectionCoverage : [];
  const providerRuntimePluginProjectionCoverage = Array.isArray(index.providerRuntimePluginProjectionCoverage) ? index.providerRuntimePluginProjectionCoverage : [];
  const runtimePluginProjectionGaps = Array.isArray(index.runtimePluginProjectionGaps) ? index.runtimePluginProjectionGaps : [];
  const localProviderCatalogs = Array.isArray(index.localProviderCatalogs) ? index.localProviderCatalogs : [];
  const interactiveWorldSurfaces = Array.isArray(index.interactiveWorldSurfaces) ? index.interactiveWorldSurfaces : [];
  const worldSurfaceLoweringCoverage = Array.isArray(index.worldSurfaceLoweringCoverage) ? index.worldSurfaceLoweringCoverage : [];
  const commandBoundaryCoverage = Array.isArray(index.commandBoundaryCoverage) ? index.commandBoundaryCoverage : [];
  const screenshotComparisonMetrics = Array.isArray(index.screenshotComparisonMetrics) ? index.screenshotComparisonMetrics : [];
  const runtimeCaptureProbeCoverage = Array.isArray(index.runtimeCaptureProbeCoverage) ? index.runtimeCaptureProbeCoverage : [];
  const runtimeWitnesses = Array.isArray(index.runtimeWitnesses) ? index.runtimeWitnesses : [];
  const splitTargetBlockers = Array.isArray(index.splitTargetBlockers) ? index.splitTargetBlockers : [];
  const splitHandoffMoveCoverage = Array.isArray(index.splitHandoffMoveCoverage) ? index.splitHandoffMoveCoverage : [];
  const pluginHandoffMoveCoverage = Array.isArray(index.pluginHandoffMoveCoverage) ? index.pluginHandoffMoveCoverage : [];
  const providerHandoffMoveCoverage = Array.isArray(index.providerHandoffMoveCoverage) ? index.providerHandoffMoveCoverage : [];
  const worldSurfaceLoweringGaps = Array.isArray(index.worldSurfaceLoweringGaps) ? index.worldSurfaceLoweringGaps : [];

  validatePluginRecords(plugins, errors);
  validatePluginWitnesses(pluginWitnesses, directory, errors);
  validatePluginAbiOperationCoverage(index.pluginAbiOperationCoverage, errors);
  validateProviderRecords(providers, errors);
  validateProviderPluginRequirementCoverage(index.providerPluginRequirementCoverage, errors);
  validateRuntimeRecords(runtimes, errors);
  validateSplitTargetRecords(splitTargets, errors);
  validateInteractiveWorldSurfaces(index.interactiveWorldSurfaces, errors);

  if (expectations.conformanceHandoff && !index.conformanceHandoffPath) {
    errors.push("conformanceHandoffPath:missing");
  }
  if (expectations.conformanceHandoff) {
    validateExportedHandoff(index.conformanceHandoffExportPath, directory, "conformanceHandoff", errors);
  }
  if (expectations.capabilityMatrix) {
    validateCapabilityMatrix(index.capabilityMatrix, packs, plugins, providers, runtimes, splitTargets, errors);
  }
  validateCapabilityGaps(index.capabilityGaps, errors);
  validateRuntimePluginProjectionCoverage(index.runtimePluginProjectionCoverage, errors);
  validateProviderRuntimePluginProjectionCoverage(index.providerRuntimePluginProjectionCoverage, errors);
  validateRuntimePluginProjectionGaps(index.runtimePluginProjectionGaps, errors);
  validateLocalProviderCatalogs(index.localProviderCatalogs, directory, errors);
  validateSplitTargetBlockers(index.splitTargetBlockers, errors);
  validateSplitHandoffMoveCoverage(index.splitHandoffMoveCoverage, errors);
  validatePluginHandoffMoveCoverage(index.pluginHandoffMoveCoverage, errors);
  validateProviderHandoffMoveCoverage(index.providerHandoffMoveCoverage, errors);
  validateWorldSurfaceLoweringCoverage(index.worldSurfaceLoweringCoverage, errors);
  validateCommandBoundaryCoverage(index.commandBoundaryCoverage, errors);
  validateScreenshotComparisonMetrics(index.screenshotComparisonMetrics, errors);
  validateRuntimeCaptureProbeCoverage(index.runtimeCaptureProbeCoverage, errors);
  validateRuntimeWitnesses(runtimeWitnesses, directory, errors);
  validateWorldSurfaceLoweringGaps(index.worldSurfaceLoweringGaps, errors);
  for (const expectedGap of expectations.capabilityGaps) {
    if (!capabilityGaps.some(gap => capabilityGapText(gap).includes(expectedGap))) {
      errors.push(`capabilityGaps:${expectedGap}:missing`);
    }
  }
  for (const expectation of expectations.runtimePluginProjectionCoverage) {
    const record = runtimePluginProjectionCoverage.find(candidate =>
      candidate.runtimeId === expectation.runtimeId &&
      candidate.pluginId === expectation.pluginId);
    if (!record) {
      errors.push(`runtimePluginProjectionCoverage:${expectation.runtimeId}:${expectation.pluginId}:missing`);
      continue;
    }
    if (record.status !== expectation.status) {
      errors.push(`runtimePluginProjectionCoverage:${expectation.runtimeId}:${expectation.pluginId}:status:expected ${expectation.status} got ${record.status || ""}`);
    }
    if (record.runtimeOwnerRepo !== expectation.ownerRepo) {
      errors.push(`runtimePluginProjectionCoverage:${expectation.runtimeId}:${expectation.pluginId}:runtimeOwnerRepo:expected ${expectation.ownerRepo} got ${record.runtimeOwnerRepo || ""}`);
    }
  }
  for (const expectation of expectations.runtimeWitnesses) {
    const witness = runtimeWitnesses.find(candidate =>
      candidate.runtimeId === expectation.runtimeId &&
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.cacheState === expectation.cacheState);
    if (!witness) {
      errors.push(`runtimeWitnesses:${expectation.runtimeId}:${expectation.providerId}:${expectation.surfaceId}:${expectation.cacheState}:missing`);
      continue;
    }
    if (witness.status !== expectation.status) {
      errors.push(`runtimeWitnesses:${witness.witnessId}:status:expected ${expectation.status} got ${witness.status || ""}`);
    }
  }
  for (const expectation of expectations.pluginWitnesses) {
    const witness = pluginWitnesses.find(candidate =>
      candidate.pluginId === expectation.pluginId && candidate.transport === expectation.transport);
    if (!witness) {
      errors.push(`pluginWitnesses:${expectation.pluginId}:${expectation.transport}:missing`);
      continue;
    }
    if (witness.status !== expectation.status) errors.push(`pluginWitnesses:${expectation.pluginId}:status:expected ${expectation.status} got ${witness.status || ""}`);
  }
  for (const expectation of expectations.providerRuntimePluginProjectionCoverage) {
    const record = providerRuntimePluginProjectionCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.runtimeId === expectation.runtimeId &&
      candidate.pluginId === expectation.pluginId);
    if (!record) {
      errors.push(`providerRuntimePluginProjectionCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.runtimeId}:${expectation.pluginId}:missing`);
      continue;
    }
    if (record.status !== expectation.status) {
      errors.push(`providerRuntimePluginProjectionCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.runtimeId}:${expectation.pluginId}:status:expected ${expectation.status} got ${record.status || ""}`);
    }
    if (record.runtimeOwnerRepo !== expectation.runtimeOwnerRepo) {
      errors.push(`providerRuntimePluginProjectionCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.runtimeId}:${expectation.pluginId}:runtimeOwnerRepo:expected ${expectation.runtimeOwnerRepo} got ${record.runtimeOwnerRepo || ""}`);
    }
  }
  for (const expectation of expectations.runtimePluginGaps) {
    const gap = runtimePluginProjectionGaps.find(candidate =>
      candidate.runtimeId === expectation.runtimeId &&
      candidate.pluginId === expectation.pluginId);
    if (!gap) {
      errors.push(`runtimePluginProjectionGaps:${expectation.runtimeId}:${expectation.pluginId}:missing`);
      continue;
    }
    if (gap.ownerRepo !== expectation.ownerRepo) {
      errors.push(`runtimePluginProjectionGaps:${expectation.runtimeId}:${expectation.pluginId}:ownerRepo:expected ${expectation.ownerRepo} got ${gap.ownerRepo || ""}`);
    }
    if (!gap.reason) {
      errors.push(`runtimePluginProjectionGaps:${expectation.runtimeId}:${expectation.pluginId}:reason:missing`);
    }
  }
  for (const expectation of expectations.localProviderCatalogs) {
    const catalog = localProviderCatalogs.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!catalog) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:missing`);
      continue;
    }
    if (catalog.status !== expectation.status) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:status:expected ${expectation.status} got ${catalog.status || ""}`);
    }
    if (!catalog.catalogPath?.includes(expectation.pathSubstring) && !catalog.catalogExportPath?.includes(expectation.pathSubstring)) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:path:expected substring ${expectation.pathSubstring}`);
    }
  }
  for (const expectation of expectations.localProviderCatalogProviders) {
    const catalog = localProviderCatalogs.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!catalog) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:missing`);
      continue;
    }
    if (!Array.isArray(catalog.providerIds) || !catalog.providerIds.includes(expectation.providerId)) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:provider:${expectation.providerId}:missing`);
    }
  }
  for (const expectation of expectations.localProviderCatalogAdvertisements) {
    const catalog = localProviderCatalogs.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!catalog) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:missing`);
      continue;
    }
    if (!Array.isArray(catalog.advertisementPaths) || !catalog.advertisementPaths.some(candidate => candidate.includes(expectation.pathSubstring))) {
      errors.push(`localProviderCatalogs:${expectation.runtimeId}:advertisement:${expectation.pathSubstring}:missing`);
    }
  }
  for (const expectation of expectations.worldLoweringCoverage) {
    const coverage = worldSurfaceLoweringCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.targetId === expectation.targetId);
    if (!coverage) {
      errors.push(`worldSurfaceLoweringCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:missing`);
      continue;
    }
    if (coverage.status !== expectation.status) {
      errors.push(`worldSurfaceLoweringCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:status:expected ${expectation.status} got ${coverage.status || ""}`);
    }
    if (coverage.runtimeOwnerRepo !== expectation.ownerRepo) {
      errors.push(`worldSurfaceLoweringCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:runtimeOwnerRepo:expected ${expectation.ownerRepo} got ${coverage.runtimeOwnerRepo || ""}`);
    }
    if (coverage.runtimeId !== expectation.runtimeId) {
      errors.push(`worldSurfaceLoweringCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:runtimeId:expected ${expectation.runtimeId} got ${coverage.runtimeId || ""}`);
    }
  }
  for (const expectation of expectations.commandBoundaryCoverage) {
    const coverage = commandBoundaryCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.targetId === expectation.targetId);
    if (!coverage) {
      errors.push(`commandBoundaryCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:missing`);
      continue;
    }
    if (coverage.status !== expectation.status) {
      errors.push(`commandBoundaryCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:status:expected ${expectation.status} got ${coverage.status || ""}`);
    }
    if (coverage.runtimeOwnerRepo !== expectation.ownerRepo) {
      errors.push(`commandBoundaryCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:runtimeOwnerRepo:expected ${expectation.ownerRepo} got ${coverage.runtimeOwnerRepo || ""}`);
    }
    if (coverage.runtimeId !== expectation.runtimeId) {
      errors.push(`commandBoundaryCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:runtimeId:expected ${expectation.runtimeId} got ${coverage.runtimeId || ""}`);
    }
  }
  for (const expectation of expectations.worldLoweringGaps) {
    const gap = worldSurfaceLoweringGaps.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.targetId === expectation.targetId);
    if (!gap) {
      errors.push(`worldSurfaceLoweringGaps:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:missing`);
      continue;
    }
    if (gap.ownerRepo !== expectation.ownerRepo) {
      errors.push(`worldSurfaceLoweringGaps:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:ownerRepo:expected ${expectation.ownerRepo} got ${gap.ownerRepo || ""}`);
    }
    if (gap.runtimeId !== expectation.runtimeId) {
      errors.push(`worldSurfaceLoweringGaps:${expectation.providerId}:${expectation.surfaceId}:${expectation.targetId}:runtimeId:expected ${expectation.runtimeId} got ${gap.runtimeId || ""}`);
    }
  }
  for (const expectation of expectations.screenshotMetrics) {
    const metric = screenshotComparisonMetrics.find(candidate =>
      candidate.runtimeId === expectation.runtimeId &&
      candidate.fixtureId === expectation.fixtureId &&
      candidate.metricKind === expectation.metricKind);
    if (!metric) {
      errors.push(`screenshotComparisonMetrics:${expectation.runtimeId}:${expectation.fixtureId}:${expectation.metricKind}:missing`);
      continue;
    }
    if (metric.status !== expectation.status) {
      errors.push(`screenshotComparisonMetrics:${expectation.runtimeId}:${expectation.fixtureId}:${expectation.metricKind}:status:expected ${expectation.status} got ${metric.status || ""}`);
    }
  }
  for (const expectation of expectations.runtimeCaptureProbes) {
    const record = runtimeCaptureProbeCoverage.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!record) {
      errors.push(`runtimeCaptureProbeCoverage:${expectation.runtimeId}:missing`);
      continue;
    }
    if (record.status !== expectation.status) {
      errors.push(`runtimeCaptureProbeCoverage:${expectation.runtimeId}:status:expected ${expectation.status} got ${record.status || ""}`);
    }
    if (record.contractArtifactKind !== expectation.contractArtifactKind) {
      errors.push(`runtimeCaptureProbeCoverage:${expectation.runtimeId}:contractArtifactKind:expected ${expectation.contractArtifactKind} got ${record.contractArtifactKind || ""}`);
    }
    if (record.captureOwnerRepo !== expectation.captureOwnerRepo) {
      errors.push(`runtimeCaptureProbeCoverage:${expectation.runtimeId}:captureOwnerRepo:expected ${expectation.captureOwnerRepo} got ${record.captureOwnerRepo || ""}`);
    }
  }

  for (const expectedFixture of expectations.fixtures) {
    if (!fixtureIds.has(expectedFixture)) errors.push(`fixture:${expectedFixture}:missing`);
  }
  for (const expectedPlugin of expectations.plugins) {
    if (!plugins.some(plugin => plugin.pluginId === expectedPlugin)) errors.push(`plugins:${expectedPlugin}:missing`);
  }
  for (const expectation of expectations.pluginOperations) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    if (!Array.isArray(plugin.abiOperations) || !plugin.abiOperations.includes(expectation.operation)) {
      errors.push(`plugins:${expectation.pluginId}:operation:${expectation.operation}:missing`);
    }
  }
  for (const expectation of expectations.pluginCapabilities) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    if (!Array.isArray(plugin.capabilities) || !plugin.capabilities.includes(expectation.capability)) {
      errors.push(`plugins:${expectation.pluginId}:capability:${expectation.capability}:missing`);
    }
  }
  for (const expectation of expectations.pluginRuntimes) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    if (plugin.runtimeBoundary?.invocationModel !== expectation.invocationModel) {
      errors.push(`plugins:${expectation.pluginId}:runtime:expected ${expectation.invocationModel} got ${plugin.runtimeBoundary?.invocationModel || ""}`);
    }
  }
  for (const expectation of expectations.pluginRuntimeTransports) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    if (!Array.isArray(plugin.runtimeBoundary?.transports) || !plugin.runtimeBoundary.transports.includes(expectation.transport)) {
      errors.push(`plugins:${expectation.pluginId}:runtime.transport:${expectation.transport}:missing`);
    }
  }
  for (const expectation of expectations.pluginRuntimeAuthorities) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    if (!Array.isArray(plugin.runtimeBoundary?.authority) || !plugin.runtimeBoundary.authority.includes(expectation.authority)) {
      errors.push(`plugins:${expectation.pluginId}:runtime.authority:${expectation.authority}:missing`);
    }
  }
  for (const expectation of expectations.pluginRuntimeFields) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    const actual = readNestedField(plugin.runtimeBoundary, expectation.fieldPath);
    if (actual !== expectation.value) {
      errors.push(`plugins:${expectation.pluginId}:runtime.${expectation.fieldPath}:expected ${expectation.value} got ${actual || ""}`);
    }
  }
  for (const expectation of expectations.pluginAbiFields) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectation.pluginId);
    if (!plugin) {
      errors.push(`plugins:${expectation.pluginId}:missing`);
      continue;
    }
    const contracts = Array.isArray(plugin.abiOperationContracts) ? plugin.abiOperationContracts : [];
    const contract = contracts.find(candidate => candidate.operation === expectation.operation);
    if (!contract) {
      errors.push(`plugins:${expectation.pluginId}:abiOperation:${expectation.operation}:missing`);
      continue;
    }
    const actual = readNestedField(contract, expectation.fieldPath);
    if (actual !== expectation.value) {
      errors.push(`plugins:${expectation.pluginId}:abiOperation:${expectation.operation}.${expectation.fieldPath}:expected ${expectation.value} got ${actual || ""}`);
    }
  }
  for (const expectation of expectations.pluginAbiOperationCoverage) {
    const record = pluginAbiOperationCoverage.find(candidate =>
      candidate.pluginId === expectation.pluginId &&
      candidate.operation === expectation.operation);
    if (!record) {
      errors.push(`pluginAbiOperationCoverage:${expectation.pluginId}:${expectation.operation}:missing`);
      continue;
    }
    if (record.status !== expectation.status) {
      errors.push(`pluginAbiOperationCoverage:${expectation.pluginId}:${expectation.operation}:status:expected ${expectation.status} got ${record.status || ""}`);
    }
    if (record.ownerRepo !== expectation.ownerRepo) {
      errors.push(`pluginAbiOperationCoverage:${expectation.pluginId}:${expectation.operation}:ownerRepo:expected ${expectation.ownerRepo} got ${record.ownerRepo || ""}`);
    }
  }
  for (const expectedPlugin of expectations.pluginHandoffs) {
    const plugin = plugins.find(candidate => candidate.pluginId === expectedPlugin);
    if (!plugin) {
      errors.push(`plugins:${expectedPlugin}:missing`);
      continue;
    }
    if (!plugin.handoffPath) {
      errors.push(`plugins:${expectedPlugin}:handoffPath:missing`);
    }
    validateExportedHandoff(plugin.handoffExportPath, directory, `plugins:${expectedPlugin}:handoff`, errors);
  }
  for (const expectedProvider of expectations.providers) {
    if (!providers.some(provider => provider.providerId === expectedProvider)) errors.push(`providers:${expectedProvider}:missing`);
  }
  for (const expectation of expectations.providerSurfaces) {
    const provider = providers.find(candidate => candidate.providerId === expectation.providerId);
    if (!provider) {
      errors.push(`providers:${expectation.providerId}:missing`);
      continue;
    }
    if (!Array.isArray(provider.surfaces) || !provider.surfaces.includes(expectation.surfaceId)) {
      errors.push(`providers:${expectation.providerId}:surface:${expectation.surfaceId}:missing`);
    }
  }
  for (const expectation of expectations.providerSurfaceKinds) {
    const provider = providers.find(candidate => candidate.providerId === expectation.providerId);
    if (!provider) {
      errors.push(`providers:${expectation.providerId}:missing`);
      continue;
    }
    const surfaceKinds = Array.isArray(provider.surfaceKinds) ? provider.surfaceKinds : [];
    const surface = surfaceKinds.find(candidate => candidate.surfaceId === expectation.surfaceId);
    if (!surface) {
      errors.push(`providers:${expectation.providerId}:surfaceKind:${expectation.surfaceId}:missing`);
    } else if (surface.surfaceKind !== expectation.surfaceKind) {
      errors.push(`providers:${expectation.providerId}:surfaceKind:${expectation.surfaceId}:expected ${expectation.surfaceKind} got ${surface.surfaceKind || ""}`);
    }
  }
  for (const expectation of expectations.providerSurfaceFields) {
    const provider = providers.find(candidate => candidate.providerId === expectation.providerId);
    if (!provider) {
      errors.push(`providers:${expectation.providerId}:missing`);
      continue;
    }
    const surfaceContracts = Array.isArray(provider.surfaceContracts) ? provider.surfaceContracts : [];
    const surface = surfaceContracts.find(candidate => candidate.surfaceId === expectation.surfaceId);
    if (!surface) {
      errors.push(`providers:${expectation.providerId}:surfaceContract:${expectation.surfaceId}:missing`);
      continue;
    }
    const actual = readNestedField(surface, expectation.fieldPath);
    if (actual !== expectation.value) {
      errors.push(`providers:${expectation.providerId}:surfaceContract:${expectation.surfaceId}.${expectation.fieldPath}:expected ${expectation.value} got ${actual || ""}`);
    }
  }
  for (const expectation of expectations.interactiveWorldSurfaces) {
    const surface = interactiveWorldSurfaces.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId);
    if (!surface) {
      errors.push(`interactiveWorldSurfaces:${expectation.providerId}:${expectation.surfaceId}:missing`);
      continue;
    }
    if (surface.ownerRepo !== expectation.ownerRepo) {
      errors.push(`interactiveWorldSurfaces:${expectation.providerId}:${expectation.surfaceId}:ownerRepo:expected ${expectation.ownerRepo} got ${surface.ownerRepo || ""}`);
    }
    if (!Array.isArray(surface.loweringTargets) || !surface.loweringTargets.includes(expectation.targetId)) {
      errors.push(`interactiveWorldSurfaces:${expectation.providerId}:${expectation.surfaceId}:target:${expectation.targetId}:missing`);
    }
    for (const field of ["projectionKind", "commandBoundary", "receiptSchema", "ownership"]) {
      if (!surface[field]) errors.push(`interactiveWorldSurfaces:${expectation.providerId}:${expectation.surfaceId}:${field}:missing`);
    }
  }
  for (const expectation of expectations.providerPluginRequirements) {
    const requirement = providerPluginRequirementCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.pluginId === expectation.pluginId);
    if (!requirement) {
      errors.push(`providerPluginRequirementCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.pluginId}:missing`);
      continue;
    }
    if (requirement.status !== expectation.status) {
      errors.push(`providerPluginRequirementCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.pluginId}:status:expected ${expectation.status} got ${requirement.status || ""}`);
    }
    if (requirement.pluginOwnerRepo !== expectation.pluginOwnerRepo) {
      errors.push(`providerPluginRequirementCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.pluginId}:pluginOwnerRepo:expected ${expectation.pluginOwnerRepo} got ${requirement.pluginOwnerRepo || ""}`);
    }
    if (expectation.availability && requirement.availability !== expectation.availability) {
      errors.push(`providerPluginRequirementCoverage:${expectation.providerId}:${expectation.surfaceId}:${expectation.pluginId}:availability:expected ${expectation.availability} got ${requirement.availability || ""}`);
    }
  }
  for (const expectation of expectations.independentNestedPlugins) {
    const parentRequirement = providerPluginRequirementCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.pluginId === expectation.parentPluginId);
    const nestedRequirement = providerPluginRequirementCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.surfaceId === expectation.surfaceId &&
      candidate.pluginId === expectation.nestedPluginId);
    if (!parentRequirement) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.parentPluginId}:parent:missing`);
      continue;
    }
    if (!nestedRequirement) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:nested:missing`);
      continue;
    }
    if (parentRequirement.availability !== "required") {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.parentPluginId}:parent.availability:expected required got ${parentRequirement.availability || ""}`);
    }
    if (nestedRequirement.availability !== "optional-nested") {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:nested.availability:expected optional-nested got ${nestedRequirement.availability || ""}`);
    }
    if (!["optional-satisfied", "optional-degraded"].includes(nestedRequirement.status)) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:nested.status:expected optional-satisfied or optional-degraded got ${nestedRequirement.status || ""}`);
    }
    if (nestedRequirement.pluginOwnerRepo !== expectation.nestedOwnerRepo) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:nested.pluginOwnerRepo:expected ${expectation.nestedOwnerRepo} got ${nestedRequirement.pluginOwnerRepo || ""}`);
    }
    if (nestedRequirement.pluginOwnerRepo === parentRequirement.pluginOwnerRepo) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:owner:expected owner distinct from parent ${parentRequirement.pluginOwnerRepo || ""}`);
    }
    if (Array.isArray(nestedRequirement.requiredCapabilities) && nestedRequirement.requiredCapabilities.length) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:requiredCapabilities:expected empty got ${nestedRequirement.requiredCapabilities.join(",")}`);
    }
    if (!Array.isArray(nestedRequirement.optionalCapabilities) || !nestedRequirement.optionalCapabilities.length) {
      errors.push(`independentNestedPlugin:${expectation.providerId}:${expectation.surfaceId}:${expectation.nestedPluginId}:optionalCapabilities:missing`);
    }
  }
  for (const expectation of expectations.providerCommands) {
    const provider = providers.find(candidate => candidate.providerId === expectation.providerId);
    if (!provider) {
      errors.push(`providers:${expectation.providerId}:missing`);
      continue;
    }
    if (!Array.isArray(provider.commands) || !provider.commands.includes(expectation.command)) {
      errors.push(`providers:${expectation.providerId}:command:${expectation.command}:missing`);
    }
  }
  for (const expectation of expectations.providerReceiptStates) {
    const provider = providers.find(candidate => candidate.providerId === expectation.providerId);
    if (!provider) {
      errors.push(`providers:${expectation.providerId}:missing`);
      continue;
    }
    if (!Array.isArray(provider.receiptStates) || !provider.receiptStates.includes(expectation.state)) {
      errors.push(`providers:${expectation.providerId}:receiptState:${expectation.state}:missing`);
    }
  }
  for (const expectedProvider of expectations.providerHandoffs) {
    const provider = providers.find(candidate => candidate.providerId === expectedProvider);
    if (!provider) {
      errors.push(`providers:${expectedProvider}:missing`);
      continue;
    }
    if (!provider.handoffPath) {
      errors.push(`providers:${expectedProvider}:handoffPath:missing`);
    }
    validateExportedHandoff(provider.handoffExportPath, directory, `providers:${expectedProvider}:handoff`, errors);
  }
  for (const expectedRuntime of expectations.runtimes) {
    if (!runtimes.some(runtime => runtime.runtimeId === expectedRuntime)) errors.push(`runtimes:${expectedRuntime}:missing`);
  }
  for (const expectation of expectations.runtimeStatuses) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    if (runtime.status !== expectation.status) {
      errors.push(`runtimes:${expectation.runtimeId}:status:expected ${expectation.status} got ${runtime.status || ""}`);
    }
  }
  for (const expectation of expectations.runtimeFeatures) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    if (!Array.isArray(runtime.supportedFeatures) || !runtime.supportedFeatures.includes(expectation.feature)) {
      errors.push(`runtimes:${expectation.runtimeId}:feature:${expectation.feature}:missing`);
    }
  }
  for (const expectation of expectations.runtimeWorldTargets) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const worldTargets = Array.isArray(runtime.worldSurfaceLowering) ? runtime.worldSurfaceLowering : [];
    if (!worldTargets.some(candidate => candidate.targetId === expectation.targetId)) {
      errors.push(`runtimes:${expectation.runtimeId}:worldSurfaceLowering:${expectation.targetId}:missing`);
    }
  }
  for (const expectation of expectations.runtimeWorldFields) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const worldTargets = Array.isArray(runtime.worldSurfaceLowering) ? runtime.worldSurfaceLowering : [];
    const target = worldTargets.find(candidate => candidate.targetId === expectation.targetId);
    if (!target) {
      errors.push(`runtimes:${expectation.runtimeId}:worldSurfaceLowering:${expectation.targetId}:missing`);
      continue;
    }
    const actual = readNestedField(target, expectation.fieldPath);
    if (actual !== expectation.value) {
      errors.push(`runtimes:${expectation.runtimeId}:worldSurfaceLowering:${expectation.targetId}.${expectation.fieldPath}:expected ${expectation.value} got ${actual || ""}`);
    }
  }
  for (const expectation of expectations.runtimeCommandSchemas) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    if (runtime.commandTransportSchema !== expectation.schema) {
      errors.push(`runtimes:${expectation.runtimeId}:commandTransportSchema:expected ${expectation.schema} got ${runtime.commandTransportSchema || ""}`);
    }
  }
  for (const expectation of expectations.runtimeCaptureStatuses) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    if (runtime.captureStatus !== expectation.status) {
      errors.push(`runtimes:${expectation.runtimeId}:captureStatus:expected ${expectation.status} got ${runtime.captureStatus || ""}`);
    }
  }
  for (const expectation of expectations.runtimeCaptureArtifacts) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const artifacts = Array.isArray(runtime.captureArtifacts) ? runtime.captureArtifacts : [];
    const artifact = artifacts.find(candidate =>
      candidate.kind === expectation.kind
      && candidate.schema === expectation.schema
      && candidate.providerId === expectation.providerId
      && candidate.surfaceId === expectation.surfaceId);
    if (!artifact) {
      errors.push(`runtimes:${expectation.runtimeId}:captureArtifacts:${expectation.kind}:${expectation.schema}:${expectation.providerId}:${expectation.surfaceId}:missing`);
    }
    const artifactErrors = Array.isArray(runtime.captureArtifactErrors) ? runtime.captureArtifactErrors : [];
    if (artifactErrors.length) {
      errors.push(`runtimes:${expectation.runtimeId}:captureArtifactErrors:${artifactErrors.join(",")}`);
    }
  }
  for (const expectation of expectations.runtimeLifecycleStatuses) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const stage = runtime.lifecycle?.[expectation.stage];
    if (!stage) {
      errors.push(`runtimes:${expectation.runtimeId}:lifecycle.${expectation.stage}:missing`);
    } else if (stage.status !== expectation.status) {
      errors.push(`runtimes:${expectation.runtimeId}:lifecycle.${expectation.stage}.status:expected ${expectation.status} got ${stage.status || ""}`);
    }
  }
  for (const expectation of expectations.runtimeLifecyclePendingProofs) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const stage = runtime.lifecycle?.[expectation.stage];
    const pendingProofs = Array.isArray(stage?.pendingProofs) ? stage.pendingProofs : [];
    if (!pendingProofs.some(proof => proof.includes(expectation.pendingProof))) {
      errors.push(`runtimes:${expectation.runtimeId}:lifecycle.${expectation.stage}.pendingProof:${expectation.pendingProof}:missing`);
    }
  }
  for (const expectation of expectations.runtimeLifecycleFields) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectation.runtimeId);
    if (!runtime) {
      errors.push(`runtimes:${expectation.runtimeId}:missing`);
      continue;
    }
    const actual = readNestedField(runtime.lifecycle?.[expectation.stage], expectation.fieldPath);
    if (actual !== expectation.value) {
      errors.push(`runtimes:${expectation.runtimeId}:lifecycle.${expectation.stage}.${expectation.fieldPath}:expected ${expectation.value} got ${actual || ""}`);
    }
  }
  for (const expectedRuntime of expectations.runtimeHandoffs) {
    const runtime = runtimes.find(candidate => candidate.runtimeId === expectedRuntime);
    if (!runtime) {
      errors.push(`runtimes:${expectedRuntime}:missing`);
      continue;
    }
    if (!runtime.splitHandoffPath) {
      errors.push(`runtimes:${expectedRuntime}:splitHandoffPath:missing`);
    }
    validateExportedHandoff(runtime.splitHandoffExportPath, directory, `runtimes:${expectedRuntime}:splitHandoff`, errors);
  }
  for (const expectedScenario of expectations.scenarios) {
    if (!providers.some(provider => provider.scenarioId === expectedScenario)) errors.push(`providers:scenario:${expectedScenario}:missing`);
  }
  for (const expectedSplitTarget of expectations.splitTargets) {
    if (!splitTargets.some(target => target.id === expectedSplitTarget)) errors.push(`splitTargets:${expectedSplitTarget}:missing`);
  }
  for (const expectation of expectations.splitTargetStatuses) {
    const target = splitTargets.find(candidate => candidate.id === expectation.targetId);
    if (!target) {
      errors.push(`splitTargets:${expectation.targetId}:missing`);
      continue;
    }
    if (target.status !== expectation.status) {
      errors.push(`splitTargets:${expectation.targetId}:status:expected ${expectation.status} got ${target.status || ""}`);
    }
  }
  for (const expectation of expectations.splitTargetBlockers) {
    const target = splitTargets.find(candidate => candidate.id === expectation.targetId);
    if (!target) {
      errors.push(`splitTargets:${expectation.targetId}:missing`);
      continue;
    }
    const blockers = Array.isArray(target.blockers) ? target.blockers : [];
    if (!blockers.some(blocker => blocker.includes(expectation.blocker))) {
      errors.push(`splitTargets:${expectation.targetId}:blocker:${expectation.blocker}:missing`);
    }
  }
  for (const expectation of expectations.splitTargetBlockerRecords) {
    const blocker = splitTargetBlockers.find(candidate =>
      candidate.targetId === expectation.targetId &&
      candidate.kind === expectation.kind &&
      candidate.subject === expectation.subject);
    if (!blocker) {
      errors.push(`splitTargetBlockers:${expectation.targetId}:${expectation.kind}:${expectation.subject}:missing`);
    }
  }
  for (const expectation of expectations.splitHandoffMoves) {
    const record = splitHandoffMoveCoverage.find(candidate =>
      candidate.splitTarget === expectation.splitTarget &&
      candidate.runtimeId === expectation.runtimeId &&
      candidate.moveSetId === expectation.moveSetId &&
      candidate.pathKind === expectation.pathKind &&
      candidate.status === expectation.status &&
      candidate.sourcePath?.includes(expectation.pathSubstring));
    if (!record) {
      errors.push(`splitHandoffMoveCoverage:${expectation.splitTarget}:${expectation.runtimeId}:${expectation.moveSetId}:${expectation.pathKind}:${expectation.status}:${expectation.pathSubstring}:missing`);
    }
  }
  for (const expectation of expectations.pluginHandoffMoves) {
    const record = pluginHandoffMoveCoverage.find(candidate =>
      candidate.pluginId === expectation.pluginId &&
      candidate.moveSetId === expectation.moveSetId &&
      candidate.pathKind === expectation.pathKind &&
      candidate.status === expectation.status &&
      candidate.sourcePath?.includes(expectation.pathSubstring));
    if (!record) {
      errors.push(`pluginHandoffMoveCoverage:${expectation.pluginId}:${expectation.moveSetId}:${expectation.pathKind}:${expectation.status}:${expectation.pathSubstring}:missing`);
    }
  }
  for (const expectation of expectations.providerHandoffMoves) {
    const record = providerHandoffMoveCoverage.find(candidate =>
      candidate.providerId === expectation.providerId &&
      candidate.moveSetId === expectation.moveSetId &&
      candidate.pathKind === expectation.pathKind &&
      candidate.status === expectation.status &&
      candidate.sourcePath?.includes(expectation.pathSubstring));
    if (!record) {
      errors.push(`providerHandoffMoveCoverage:${expectation.providerId}:${expectation.moveSetId}:${expectation.pathKind}:${expectation.status}:${expectation.pathSubstring}:missing`);
    }
  }
  for (const expectation of expectations.splitTargetProofs) {
    const target = splitTargets.find(candidate => candidate.id === expectation.targetId);
    if (!target) {
      errors.push(`splitTargets:${expectation.targetId}:missing`);
      continue;
    }
    const proofs = Array.isArray(target.proofs) ? target.proofs : [];
    const proof = proofs.find(candidate => candidate.description?.includes(expectation.proof));
    if (!proof) {
      errors.push(`splitTargets:${expectation.targetId}:proof:${expectation.proof}:missing`);
    } else if (proof.status !== "passed") {
      errors.push(`splitTargets:${expectation.targetId}:proof:${expectation.proof}:expected passed got ${proof.status || ""}`);
    }
  }

  if (!plugins.some(plugin => plugin.pluginId === "sai.vn" && plugin.abiFixturePath)) {
    errors.push("plugins:sai.vn:abiFixturePath:missing");
  }
  if (!providers.some(provider => provider.providerId === "aetheria" && provider.scenarioPath)) {
    errors.push("providers:aetheria:scenarioPath:missing");
  }
  if (!runtimes.some(runtime => runtime.runtimeId === "unity-uitoolkit" && runtime.commandTransportSchema === "gamecult.eve.command_invocation.v1")) {
    errors.push("runtimes:unity-uitoolkit:commandTransportSchema:missing");
  }
  if (!splitTargets.some(target => target.id === "EveUnity")) {
    errors.push("splitTargets:EveUnity:missing");
  }
}

function readFileSyncUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function validateExportedHandoff(exportPath, directory, label, errors) {
  if (!exportPath) {
    errors.push(`${label}:exportPath:missing`);
    return;
  }
  if (!existsSync(path.join(directory, exportPath))) {
    errors.push(`${label}:exportPath:${exportPath}:missing`);
  }
}

function validateCapabilityMatrix(matrix, packs, plugins, providers, runtimes, splitTargets, errors) {
  if (!matrix) {
    errors.push("capabilityMatrix:missing");
    return;
  }
  if (matrix.schema !== "gamecult.eve.capability_matrix.v1") {
    errors.push(`capabilityMatrix:schema:expected gamecult.eve.capability_matrix.v1 got ${matrix.schema || ""}`);
  }
  if ((matrix.packs || []).length !== packs.length) {
    errors.push(`capabilityMatrix:packs:expected ${packs.length} got ${(matrix.packs || []).length}`);
  }
  if ((matrix.plugins || []).length !== plugins.length) {
    errors.push(`capabilityMatrix:plugins:expected ${plugins.length} got ${(matrix.plugins || []).length}`);
  }
  if ((matrix.providers || []).length !== providers.length) {
    errors.push(`capabilityMatrix:providers:expected ${providers.length} got ${(matrix.providers || []).length}`);
  }
  if ((matrix.runtimes || []).length !== runtimes.length) {
    errors.push(`capabilityMatrix:runtimes:expected ${runtimes.length} got ${(matrix.runtimes || []).length}`);
  }
  if ((matrix.splitTargets || []).length !== splitTargets.length) {
    errors.push(`capabilityMatrix:splitTargets:expected ${splitTargets.length} got ${(matrix.splitTargets || []).length}`);
  }
  for (const packId of ["core", "plugin", "provider", "runtime"]) {
    if (!(matrix.packs || []).some(pack => pack.packId === packId)) {
      errors.push(`capabilityMatrix:packs:${packId}:missing`);
    }
  }
  for (const plugin of plugins) {
    if (!(matrix.plugins || []).some(candidate => candidate.pluginId === plugin.pluginId)) {
      errors.push(`capabilityMatrix:plugins:${plugin.pluginId}:missing`);
    }
  }
  for (const provider of providers) {
    if (!(matrix.providers || []).some(candidate => candidate.providerId === provider.providerId)) {
      errors.push(`capabilityMatrix:providers:${provider.providerId}:missing`);
    }
  }
  for (const runtime of runtimes) {
    if (!(matrix.runtimes || []).some(candidate => candidate.runtimeId === runtime.runtimeId)) {
      errors.push(`capabilityMatrix:runtimes:${runtime.runtimeId}:missing`);
    }
  }
}

function validateCapabilityGaps(gaps, errors) {
  if (!Array.isArray(gaps)) {
    errors.push("capabilityGaps:missing");
    return;
  }
  for (const [index, gap] of gaps.entries()) {
    for (const field of ["kind", "subjectId", "gap", "severity"]) {
      if (!gap?.[field]) errors.push(`capabilityGaps:${index}:${field}:missing`);
    }
  }
}

function validateRuntimePluginProjectionCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("runtimePluginProjectionCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["runtimeId", "runtimeStatus", "runtimeOwnerRepo", "pluginId", "pluginOwnerRepo", "status", "severity"]) {
      if (!record?.[field]) errors.push(`runtimePluginProjectionCoverage:${index}:${field}:missing`);
    }
    for (const field of ["capabilities", "requiredFixtures", "pluginFixtures"]) {
      if (!Array.isArray(record?.[field])) errors.push(`runtimePluginProjectionCoverage:${index}:${field}:expected array`);
    }
    if (record?.status === "supported" && !record.capabilities.length) {
      errors.push(`runtimePluginProjectionCoverage:${index}:capabilities:missing`);
    }
    if (record?.status === "unsupported" && !record.reason) {
      errors.push(`runtimePluginProjectionCoverage:${index}:reason:missing`);
    }
  }
}

function validateProviderRuntimePluginProjectionCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("providerRuntimePluginProjectionCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["providerId", "providerOwnerRepo", "surfaceId", "fixtureId", "runtimeId", "runtimeStatus", "runtimeOwnerRepo", "pluginId", "availability", "status", "severity"]) {
      if (!record?.[field]) errors.push(`providerRuntimePluginProjectionCoverage:${index}:${field}:missing`);
    }
    for (const field of ["requiredCapabilities", "optionalCapabilities", "runtimeCapabilities", "missingRuntimeRequiredCapabilities", "missingRuntimeOptionalCapabilities"]) {
      if (!Array.isArray(record?.[field])) errors.push(`providerRuntimePluginProjectionCoverage:${index}:${field}:expected array`);
    }
    if (record?.severity === "blocker" && record.availability !== "required") {
      errors.push(`providerRuntimePluginProjectionCoverage:${index}:severity:optional entries cannot be blocker`);
    }
  }
}

function validateRuntimePluginProjectionGaps(gaps, errors) {
  if (!Array.isArray(gaps)) {
    errors.push("runtimePluginProjectionGaps:missing");
    return;
  }
  for (const [index, gap] of gaps.entries()) {
    for (const field of ["runtimeId", "ownerRepo", "pluginId", "severity", "reason"]) {
      if (!gap?.[field]) errors.push(`runtimePluginProjectionGaps:${index}:${field}:missing`);
    }
    for (const field of ["requiredFixtures", "pluginFixtures"]) {
      if (!Array.isArray(gap?.[field])) errors.push(`runtimePluginProjectionGaps:${index}:${field}:expected array`);
    }
  }
}

function validateSplitTargetBlockers(blockers, errors) {
  if (!Array.isArray(blockers)) {
    errors.push("splitTargetBlockers:missing");
    return;
  }
  for (const [index, blocker] of blockers.entries()) {
    for (const field of ["targetId", "ownerRepo", "kind", "severity", "subject", "text"]) {
      if (!blocker?.[field]) errors.push(`splitTargetBlockers:${index}:${field}:missing`);
    }
  }
}

function validateSplitHandoffMoveCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("splitHandoffMoveCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["splitTarget", "runtimeId", "runtimeOwnerRepo", "handoffPath", "handoffExportPath", "moveSetId", "stage", "destinationOwner", "replacementProof", "pathKind", "sourcePath", "status", "severity"]) {
      if (!record?.[field]) errors.push(`splitHandoffMoveCoverage:${index}:${field}:missing`);
    }
    if (typeof record?.pathExists !== "boolean") {
      errors.push(`splitHandoffMoveCoverage:${index}:pathExists:expected boolean`);
    }
  }
}

function validatePluginHandoffMoveCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("pluginHandoffMoveCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["pluginId", "pluginOwnerRepo", "splitTarget", "handoffPath", "handoffExportPath", "moveSetId", "destinationOwner", "replacementProof", "pathKind", "sourcePath", "status", "severity"]) {
      if (!record?.[field]) errors.push(`pluginHandoffMoveCoverage:${index}:${field}:missing`);
    }
    if (typeof record?.pathExists !== "boolean") {
      errors.push(`pluginHandoffMoveCoverage:${index}:pathExists:expected boolean`);
    }
  }
}

function validateProviderHandoffMoveCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("providerHandoffMoveCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["providerId", "providerOwnerRepo", "handoffPath", "handoffExportPath", "moveSetId", "destinationOwner", "replacementProof", "pathKind", "sourcePath", "status", "severity"]) {
      if (!record?.[field]) errors.push(`providerHandoffMoveCoverage:${index}:${field}:missing`);
    }
    if (typeof record?.pathExists !== "boolean") {
      errors.push(`providerHandoffMoveCoverage:${index}:pathExists:expected boolean`);
    }
  }
}

function validateWorldSurfaceLoweringCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("worldSurfaceLoweringCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["providerId", "providerOwnerRepo", "surfaceId", "targetId", "status", "severity", "runtimeId", "runtimeOwnerRepo"]) {
      if (!record?.[field]) errors.push(`worldSurfaceLoweringCoverage:${index}:${field}:missing`);
    }
  }
}

function validateCommandBoundaryCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("commandBoundaryCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["providerId", "providerOwnerRepo", "surfaceId", "targetId", "runtimeId", "runtimeOwnerRepo", "status", "severity", "commandBoundary", "receiptSchema"]) {
      if (!record?.[field]) errors.push(`commandBoundaryCoverage:${index}:${field}:missing`);
    }
    if (record?.status === "covered" && record.runtimeCommandSchema !== "gamecult.eve.command_invocation.v1") {
      errors.push(`commandBoundaryCoverage:${index}:runtimeCommandSchema:expected gamecult.eve.command_invocation.v1 got ${record.runtimeCommandSchema || ""}`);
    }
  }
}

function validateScreenshotComparisonMetrics(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("screenshotComparisonMetrics:missing");
    return;
  }
  if (!records.length) {
    errors.push("screenshotComparisonMetrics:empty");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["runtimeId", "runtimeOwnerRepo", "fixtureId", "metricKind", "status", "evidenceLayer", "detail"]) {
      if (!record?.[field]) errors.push(`screenshotComparisonMetrics:${index}:${field}:missing`);
    }
    if (typeof record?.score !== "number") {
      errors.push(`screenshotComparisonMetrics:${index}:score:expected number`);
    }
    if (!["structure", "color-tokens", "bounding-boxes", "text-presence"].includes(record?.metricKind)) {
      errors.push(`screenshotComparisonMetrics:${index}:metricKind:unexpected ${record?.metricKind || ""}`);
    }
  }
}

function validateRuntimeCaptureProbeCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("runtimeCaptureProbeCoverage:missing");
    return;
  }
  if (!records.length) {
    errors.push("runtimeCaptureProbeCoverage:empty");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["runtimeId", "runtimeOwnerRepo", "captureOwnerRepo", "status", "severity", "detail"]) {
      if (!record?.[field]) errors.push(`runtimeCaptureProbeCoverage:${index}:${field}:missing`);
    }
    for (const field of ["pendingProofs", "errors"]) {
      if (!Array.isArray(record?.[field])) errors.push(`runtimeCaptureProbeCoverage:${index}:${field}:expected array`);
    }
    if (record?.currentArtifactPath && !record.currentArtifactKind) {
      errors.push(`runtimeCaptureProbeCoverage:${index}:currentArtifactKind:missing`);
    }
    if (record?.contractArtifactKind && !record.contractRequestSchema) {
      errors.push(`runtimeCaptureProbeCoverage:${index}:contractRequestSchema:missing`);
    }
  }
}

function validateWorldSurfaceLoweringGaps(gaps, errors) {
  if (!Array.isArray(gaps)) {
    errors.push("worldSurfaceLoweringGaps:missing");
    return;
  }
  for (const [index, gap] of gaps.entries()) {
    for (const field of ["providerId", "surfaceId", "targetId", "ownerRepo", "runtimeId", "severity"]) {
      if (!gap?.[field]) errors.push(`worldSurfaceLoweringGaps:${index}:${field}:missing`);
    }
  }
}

function validatePluginRecords(plugins, errors) {
  for (const plugin of plugins) {
    const label = `plugins:${plugin.pluginId || "unknown"}`;
    for (const field of ["pluginId", "status", "ownerRepo", "manifestPath", "advertisementPath", "abiFixturePath"]) {
      if (!plugin?.[field]) errors.push(`${label}:${field}:missing`);
    }
    if (plugin.status !== "active" && !plugin.splitTarget) errors.push(`${label}:splitTarget:missing`);
    for (const field of ["capabilities", "abiOperations", "optionalPlugins"]) {
      if (!Array.isArray(plugin?.[field])) errors.push(`${label}:${field}:expected array`);
    }
    if (!Array.isArray(plugin?.abiOperationContracts)) {
      errors.push(`${label}:abiOperationContracts:expected array`);
    }
    for (const contract of plugin?.abiOperationContracts || []) {
      if (!contract.operation) errors.push(`${label}:abiOperationContracts:operation:missing`);
      if (!contract.input || typeof contract.input !== "object" || Array.isArray(contract.input)) {
        errors.push(`${label}:abiOperationContracts:${contract.operation || "unknown"}:input:expected object`);
      }
      if (!contract.expect || typeof contract.expect !== "object" || Array.isArray(contract.expect)) {
        errors.push(`${label}:abiOperationContracts:${contract.operation || "unknown"}:expect:expected object`);
      }
    }
  }
}

function validatePluginWitnesses(witnesses, directory, errors) {
  if (!Array.isArray(witnesses)) return;
  for (const [index, witness] of witnesses.entries()) {
    for (const field of ["witnessId", "pluginId", "ownerRepo", "status", "transport", "operationCount", "witnessExportPath"]) {
      if (witness?.[field] === undefined || witness?.[field] === "") errors.push(`pluginWitnesses:${index}:${field}:missing`);
    }
    const witnessPath = witness?.witnessExportPath ? path.join(directory, witness.witnessExportPath) : "";
    if (!witnessPath || !existsSync(witnessPath)) {
      errors.push(`pluginWitnesses:${index}:witnessExportPath:missing`);
      continue;
    }
    const document = JSON.parse(readFileSyncUtf8(witnessPath));
    if (document.schema !== "gamecult.eve.plugin_witness.v1") errors.push(`pluginWitnesses:${index}:schema:unexpected`);
    if ((document.operations || []).length !== witness.operationCount) errors.push(`pluginWitnesses:${index}:operationCount:mismatch`);
  }
}

function validatePluginAbiOperationCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("pluginAbiOperationCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["pluginId", "ownerRepo", "status", "operation", "abiFixturePath"]) {
      if (!record?.[field]) errors.push(`pluginAbiOperationCoverage:${index}:${field}:missing`);
    }
    for (const field of ["inputKeys", "expectKeys"]) {
      if (!Array.isArray(record?.[field])) errors.push(`pluginAbiOperationCoverage:${index}:${field}:expected array`);
    }
  }
}

function validateProviderRecords(providers, errors) {
  for (const provider of providers) {
    const label = `providers:${provider.providerId || "unknown"}`;
    for (const field of ["providerId", "status", "ownerRepo", "advertisementPath"]) {
      if (!provider?.[field]) errors.push(`${label}:${field}:missing`);
    }
    for (const field of ["surfaces", "surfaceKinds", "surfaceContracts", "commands", "pluginRequirements", "receiptStates"]) {
      if (!Array.isArray(provider?.[field])) errors.push(`${label}:${field}:expected array`);
    }
  }
}

function validateProviderPluginRequirementCoverage(records, errors) {
  if (!Array.isArray(records)) {
    errors.push("providerPluginRequirementCoverage:missing");
    return;
  }
  for (const [index, record] of records.entries()) {
    for (const field of ["providerId", "providerOwnerRepo", "surfaceId", "pluginId", "pluginStatus", "availability", "status"]) {
      if (!record?.[field]) errors.push(`providerPluginRequirementCoverage:${index}:${field}:missing`);
    }
    for (const field of ["requiredCapabilities", "optionalCapabilities", "missingRequiredCapabilities", "missingOptionalCapabilities"]) {
      if (!Array.isArray(record?.[field])) errors.push(`providerPluginRequirementCoverage:${index}:${field}:expected array`);
    }
  }
}

function validateLocalProviderCatalogs(catalogs, directory, errors) {
  if (!Array.isArray(catalogs)) {
    errors.push("localProviderCatalogs:missing");
    return;
  }
  for (const [index, catalog] of catalogs.entries()) {
    for (const field of ["runtimeId", "ownerRepo", "catalogPath", "catalogExportPath", "schema", "purpose", "status"]) {
      if (!catalog?.[field]) errors.push(`localProviderCatalogs:${index}:${field}:missing`);
    }
    for (const field of ["providerIds", "advertisementPaths", "errors"]) {
      if (!Array.isArray(catalog?.[field])) errors.push(`localProviderCatalogs:${index}:${field}:expected array`);
    }
    if (typeof catalog?.surfaceCount !== "number") errors.push(`localProviderCatalogs:${index}:surfaceCount:expected number`);
    if (catalog?.catalogExportPath && !existsSync(path.join(directory, catalog.catalogExportPath))) {
      errors.push(`localProviderCatalogs:${index}:catalogExportPath:${catalog.catalogExportPath}:missing`);
    }
  }
}

function validateInteractiveWorldSurfaces(surfaces, errors) {
  if (!Array.isArray(surfaces)) {
    errors.push("interactiveWorldSurfaces:missing");
    return;
  }
  for (const [index, surface] of surfaces.entries()) {
    for (const field of ["providerId", "ownerRepo", "surfaceId", "surfaceKind", "interactionModel", "projectionKind", "commandBoundary", "receiptSchema", "ownership"]) {
      if (!surface?.[field]) errors.push(`interactiveWorldSurfaces:${index}:${field}:missing`);
    }
    for (const field of ["stateSchemas", "loweringTargets"]) {
      if (!Array.isArray(surface?.[field])) errors.push(`interactiveWorldSurfaces:${index}:${field}:expected array`);
    }
  }
}

function validateRuntimeRecords(runtimes, errors) {
  for (const runtime of runtimes) {
    const label = `runtimes:${runtime.runtimeId || "unknown"}`;
    for (const field of ["runtimeId", "status", "ownerRepo", "splitTarget", "captureStatus"]) {
      if (!runtime?.[field]) errors.push(`${label}:${field}:missing`);
    }
    for (const field of ["supportedFeatures", "supportedPlugins", "unsupportedPlugins", "capabilityManifestErrors", "lifecycleErrors", "worldSurfaceLowering"]) {
      if (!Array.isArray(runtime?.[field])) errors.push(`${label}:${field}:expected array`);
    }
  }
}

function validateRuntimeWitnesses(witnesses, directory, errors) {
  if (!Array.isArray(witnesses)) return;
  for (const [index, witness] of witnesses.entries()) {
    for (const field of ["witnessId", "runtimeId", "runtimeOwnerRepo", "providerId", "surfaceId", "projectionKind", "status", "cacheState", "witnessExportPath", "artifactCount"]) {
      if (witness?.[field] === undefined || witness?.[field] === "") errors.push(`runtimeWitnesses:${index}:${field}:missing`);
    }
    const witnessPath = witness?.witnessExportPath ? path.join(directory, witness.witnessExportPath) : "";
    if (!witnessPath || !existsSync(witnessPath)) {
      errors.push(`runtimeWitnesses:${index}:witnessExportPath:missing`);
      continue;
    }
    const document = JSON.parse(readFileSyncUtf8(witnessPath));
    if (document.schema !== "gamecult.eve.runtime_witness.v1") errors.push(`runtimeWitnesses:${index}:schema:unexpected`);
    if ((document.artifacts || []).length !== witness.artifactCount) errors.push(`runtimeWitnesses:${index}:artifactCount:mismatch`);
    for (const artifact of document.artifacts || []) {
      if (!artifact.exportPath || !existsSync(path.join(directory, artifact.exportPath))) {
        errors.push(`runtimeWitnesses:${index}:artifact:${artifact.kind || "unknown"}:missing`);
      }
    }
  }
}

function validateSplitTargetRecords(splitTargets, errors) {
  for (const target of splitTargets) {
    const label = `splitTargets:${target.id || "unknown"}`;
    for (const field of ["id", "ownerRepo", "status", "runtimeStatuses"]) {
      if (!target?.[field]) errors.push(`${label}:${field}:missing`);
    }
    for (const field of ["runtimes", "requiredRuntimeStatuses", "requiredFeatures", "requiredPlugins", "proofs", "pendingProofs", "blockers", "blockerRecords"]) {
      if (!Array.isArray(target?.[field])) errors.push(`${label}:${field}:expected array`);
    }
  }
}

function validateSchemaCatalog(schemaCatalog, directory, expectedSchemas, errors) {
  if (!Array.isArray(schemaCatalog)) {
    errors.push("schemaCatalog:missing");
    return;
  }
  for (const [index, schema] of schemaCatalog.entries()) {
    const label = `schemaCatalog:${index}`;
    for (const field of ["schemaId", "path", "exportPath"]) {
      if (!schema?.[field]) errors.push(`${label}:${field}:missing`);
    }
    if (schema?.exportPath && !existsSync(path.join(directory, schema.exportPath))) {
      errors.push(`${label}:exportPath:${schema.exportPath}:missing`);
    }
  }
  for (const schemaId of expectedSchemas) {
    const schema = schemaCatalog.find(candidate => candidate.schemaId === schemaId);
    if (!schema) {
      errors.push(`schemaCatalog:${schemaId}:missing`);
      continue;
    }
    if (!schema.exportPath || !existsSync(path.join(directory, schema.exportPath))) {
      errors.push(`schemaCatalog:${schemaId}:exportPath:missing`);
    }
  }
}

function capabilityGapText(gap) {
  return [
    gap.kind,
    gap.ownerRepo,
    gap.subjectId,
    gap.gap,
    gap.severity,
    gap.detail,
  ].filter(Boolean).join(":");
}

function parseArguments(args) {
  const exportPath = args[0] ? path.resolve(args[0]) : "";
  const expectations = {
    packs: [],
    schemas: [],
    fixtures: [],
    plugins: [],
    pluginOperations: [],
    pluginCapabilities: [],
    pluginRuntimes: [],
    pluginRuntimeTransports: [],
    pluginRuntimeAuthorities: [],
    pluginRuntimeFields: [],
    pluginAbiFields: [],
    pluginAbiOperationCoverage: [],
    pluginHandoffs: [],
    pluginWitnesses: [],
    pluginHandoffMoves: [],
    providers: [],
    providerSurfaces: [],
    providerSurfaceKinds: [],
    providerSurfaceFields: [],
    interactiveWorldSurfaces: [],
    providerPluginRequirements: [],
    independentNestedPlugins: [],
    providerCommands: [],
    providerReceiptStates: [],
    providerHandoffs: [],
    providerHandoffMoves: [],
    runtimes: [],
    runtimeStatuses: [],
    runtimeFeatures: [],
    runtimeWorldTargets: [],
    runtimeWorldFields: [],
    runtimeHandoffs: [],
    runtimeCommandSchemas: [],
    runtimeCaptureStatuses: [],
    runtimeCaptureArtifacts: [],
    runtimeWitnesses: [],
    runtimeLifecycleStatuses: [],
    runtimeLifecyclePendingProofs: [],
    runtimeLifecycleFields: [],
    scenarios: [],
    splitTargets: [],
    splitTargetStatuses: [],
    splitTargetBlockers: [],
    splitTargetBlockerRecords: [],
    splitHandoffMoves: [],
    splitTargetProofs: [],
    capabilityMatrix: false,
    capabilityGaps: [],
    runtimePluginProjectionCoverage: [],
    providerRuntimePluginProjectionCoverage: [],
    runtimePluginGaps: [],
    localProviderCatalogs: [],
    localProviderCatalogProviders: [],
    localProviderCatalogAdvertisements: [],
    worldLoweringCoverage: [],
    commandBoundaryCoverage: [],
    worldLoweringGaps: [],
    screenshotMetrics: [],
    runtimeCaptureProbes: [],
    conformanceHandoff: false,
  };
  const optionTargets = new Map([
    ["--expect-pack", expectations.packs],
    ["--expect-schema", expectations.schemas],
    ["--expect-fixture", expectations.fixtures],
    ["--expect-plugin", expectations.plugins],
    ["--expect-provider", expectations.providers],
    ["--expect-runtime", expectations.runtimes],
    ["--expect-scenario", expectations.scenarios],
    ["--expect-split-target", expectations.splitTargets],
    ["--expect-plugin-operation", expectations.pluginOperations],
    ["--expect-plugin-capability", expectations.pluginCapabilities],
    ["--expect-plugin-runtime", expectations.pluginRuntimes],
    ["--expect-plugin-runtime-transport", expectations.pluginRuntimeTransports],
    ["--expect-plugin-runtime-authority", expectations.pluginRuntimeAuthorities],
    ["--expect-plugin-runtime-field", expectations.pluginRuntimeFields],
    ["--expect-plugin-abi-field", expectations.pluginAbiFields],
    ["--expect-plugin-abi-operation-coverage", expectations.pluginAbiOperationCoverage],
    ["--expect-plugin-handoff", expectations.pluginHandoffs],
    ["--expect-plugin-witness", expectations.pluginWitnesses],
    ["--expect-plugin-handoff-move", expectations.pluginHandoffMoves],
    ["--expect-provider-surface", expectations.providerSurfaces],
    ["--expect-provider-surface-kind", expectations.providerSurfaceKinds],
    ["--expect-provider-surface-field", expectations.providerSurfaceFields],
    ["--expect-interactive-world-surface", expectations.interactiveWorldSurfaces],
    ["--expect-provider-plugin-requirement", expectations.providerPluginRequirements],
    ["--expect-independent-nested-plugin", expectations.independentNestedPlugins],
    ["--expect-provider-command", expectations.providerCommands],
    ["--expect-provider-receipt-state", expectations.providerReceiptStates],
    ["--expect-provider-handoff", expectations.providerHandoffs],
    ["--expect-provider-handoff-move", expectations.providerHandoffMoves],
    ["--expect-runtime-status", expectations.runtimeStatuses],
    ["--expect-runtime-feature", expectations.runtimeFeatures],
    ["--expect-runtime-world-target", expectations.runtimeWorldTargets],
    ["--expect-runtime-world-field", expectations.runtimeWorldFields],
    ["--expect-runtime-handoff", expectations.runtimeHandoffs],
    ["--expect-runtime-command-schema", expectations.runtimeCommandSchemas],
    ["--expect-runtime-capture-status", expectations.runtimeCaptureStatuses],
    ["--expect-runtime-capture-artifact", expectations.runtimeCaptureArtifacts],
    ["--expect-runtime-witness", expectations.runtimeWitnesses],
    ["--expect-runtime-lifecycle-status", expectations.runtimeLifecycleStatuses],
    ["--expect-runtime-lifecycle-pending", expectations.runtimeLifecyclePendingProofs],
    ["--expect-runtime-lifecycle-field", expectations.runtimeLifecycleFields],
    ["--expect-split-target-status", expectations.splitTargetStatuses],
    ["--expect-split-target-blocker", expectations.splitTargetBlockers],
    ["--expect-split-target-blocker-record", expectations.splitTargetBlockerRecords],
    ["--expect-split-handoff-move", expectations.splitHandoffMoves],
    ["--expect-split-target-proof", expectations.splitTargetProofs],
    ["--expect-capability-gap", expectations.capabilityGaps],
    ["--expect-runtime-plugin-projection", expectations.runtimePluginProjectionCoverage],
    ["--expect-provider-runtime-plugin-projection", expectations.providerRuntimePluginProjectionCoverage],
    ["--expect-runtime-plugin-gap", expectations.runtimePluginGaps],
    ["--expect-local-provider-catalog", expectations.localProviderCatalogs],
    ["--expect-local-provider-catalog-provider", expectations.localProviderCatalogProviders],
    ["--expect-local-provider-catalog-advertisement", expectations.localProviderCatalogAdvertisements],
    ["--expect-world-lowering-coverage", expectations.worldLoweringCoverage],
    ["--expect-command-boundary-coverage", expectations.commandBoundaryCoverage],
    ["--expect-world-lowering-gap", expectations.worldLoweringGaps],
    ["--expect-screenshot-metric", expectations.screenshotMetrics],
    ["--expect-runtime-capture-probe", expectations.runtimeCaptureProbes],
  ]);

  for (let index = 1; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--expect-capability-matrix") {
      expectations.capabilityMatrix = true;
      continue;
    }
    if (option === "--expect-conformance-handoff") {
      expectations.conformanceHandoff = true;
      continue;
    }
    const target = optionTargets.get(option);
    if (!target) {
      console.error(`Unknown option: ${option}`);
      process.exit(2);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      console.error(`Missing value for option: ${option}`);
      process.exit(2);
    }
    if (option === "--expect-plugin-operation") {
      target.push(parsePluginExpectation(value, "operation"));
    } else if (option === "--expect-plugin-capability") {
      target.push(parsePluginExpectation(value, "capability"));
    } else if (option === "--expect-plugin-runtime") {
      target.push(parsePluginExpectation(value, "invocationModel"));
    } else if (option === "--expect-plugin-runtime-transport") {
      target.push(parsePluginExpectation(value, "transport"));
    } else if (option === "--expect-plugin-runtime-authority") {
      target.push(parsePluginExpectation(value, "authority"));
    } else if (option === "--expect-plugin-runtime-field") {
      target.push(parsePluginRuntimeFieldExpectation(value));
    } else if (option === "--expect-plugin-abi-field") {
      target.push(parsePluginAbiFieldExpectation(value));
    } else if (option === "--expect-plugin-abi-operation-coverage") {
      target.push(parsePluginAbiOperationCoverageExpectation(value));
    } else if (option === "--expect-plugin-handoff") {
      target.push(value);
    } else if (option === "--expect-plugin-witness") {
      target.push(parsePluginWitnessExpectation(value));
    } else if (option === "--expect-plugin-handoff-move") {
      target.push(parsePluginHandoffMoveExpectation(value));
    } else if (option === "--expect-provider-surface") {
      target.push(parseProviderExpectation(value, "surfaceId"));
    } else if (option === "--expect-provider-surface-kind") {
      target.push(parseProviderSurfaceKindExpectation(value));
    } else if (option === "--expect-provider-surface-field") {
      target.push(parseProviderSurfaceFieldExpectation(value));
    } else if (option === "--expect-interactive-world-surface") {
      target.push(parseInteractiveWorldSurfaceExpectation(value));
    } else if (option === "--expect-provider-plugin-requirement") {
      target.push(parseProviderPluginRequirementExpectation(value));
    } else if (option === "--expect-independent-nested-plugin") {
      target.push(parseIndependentNestedPluginExpectation(value));
    } else if (option === "--expect-provider-command") {
      target.push(parseProviderExpectation(value, "command"));
    } else if (option === "--expect-provider-receipt-state") {
      target.push(parseProviderExpectation(value, "state"));
    } else if (option === "--expect-provider-handoff") {
      target.push(value);
    } else if (option === "--expect-provider-handoff-move") {
      target.push(parseProviderHandoffMoveExpectation(value));
    } else if (option === "--expect-runtime-status") {
      target.push(parseRuntimeExpectation(value, "status"));
    } else if (option === "--expect-runtime-feature") {
      target.push(parseRuntimeExpectation(value, "feature"));
    } else if (option === "--expect-runtime-world-target") {
      target.push(parseRuntimeWorldTargetExpectation(value));
    } else if (option === "--expect-runtime-world-field") {
      target.push(parseRuntimeWorldFieldExpectation(value));
    } else if (option === "--expect-runtime-handoff") {
      target.push(value);
    } else if (option === "--expect-runtime-command-schema") {
      target.push(parseRuntimeExpectation(value, "schema"));
    } else if (option === "--expect-runtime-capture-status") {
      target.push(parseRuntimeExpectation(value, "status"));
    } else if (option === "--expect-runtime-capture-artifact") {
      target.push(parseRuntimeCaptureArtifactExpectation(value));
    } else if (option === "--expect-runtime-witness") {
      target.push(parseRuntimeWitnessExpectation(value));
    } else if (option === "--expect-runtime-lifecycle-status") {
      target.push(parseRuntimeLifecycleExpectation(value, "status"));
    } else if (option === "--expect-runtime-lifecycle-pending") {
      target.push(parseRuntimeLifecycleExpectation(value, "pendingProof"));
    } else if (option === "--expect-runtime-lifecycle-field") {
      target.push(parseRuntimeLifecycleFieldExpectation(value));
    } else if (option === "--expect-split-target-status") {
      target.push(parseSplitTargetExpectation(value, "status"));
    } else if (option === "--expect-split-target-blocker") {
      target.push(parseSplitTargetExpectation(value, "blocker"));
    } else if (option === "--expect-split-target-blocker-record") {
      target.push(parseSplitTargetBlockerRecordExpectation(value));
    } else if (option === "--expect-split-handoff-move") {
      target.push(parseSplitHandoffMoveExpectation(value));
    } else if (option === "--expect-split-target-proof") {
      target.push(parseSplitTargetExpectation(value, "proof"));
    } else if (option === "--expect-world-lowering-gap") {
      target.push(parseWorldLoweringGapExpectation(value));
    } else if (option === "--expect-world-lowering-coverage") {
      target.push(parseWorldLoweringCoverageExpectation(value));
    } else if (option === "--expect-command-boundary-coverage") {
      target.push(parseCommandBoundaryCoverageExpectation(value));
    } else if (option === "--expect-screenshot-metric") {
      target.push(parseScreenshotMetricExpectation(value));
    } else if (option === "--expect-runtime-capture-probe") {
      target.push(parseRuntimeCaptureProbeExpectation(value));
    } else if (option === "--expect-runtime-plugin-gap") {
      target.push(parseRuntimePluginGapExpectation(value));
    } else if (option === "--expect-runtime-plugin-projection") {
      target.push(parseRuntimePluginProjectionCoverageExpectation(value));
    } else if (option === "--expect-provider-runtime-plugin-projection") {
      target.push(parseProviderRuntimePluginProjectionCoverageExpectation(value));
    } else if (option === "--expect-local-provider-catalog") {
      target.push(parseLocalProviderCatalogExpectation(value));
    } else if (option === "--expect-local-provider-catalog-provider") {
      target.push(parseLocalProviderCatalogProviderExpectation(value));
    } else if (option === "--expect-local-provider-catalog-advertisement") {
      target.push(parseLocalProviderCatalogAdvertisementExpectation(value));
    } else {
      target.push(value);
    }
    index += 1;
  }

  return { exportDirectory: exportPath, expectations };
}

function parseScreenshotMetricExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some(part => !part)) {
    console.error(`Expected screenshot metric in <runtimeId:fixtureId:metricKind:status> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    fixtureId: parts[1],
    metricKind: parts[2],
    status: parts[3],
  };
}

function parseRuntimeCaptureProbeExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some(part => !part)) {
    console.error(`Expected runtime capture probe in <runtimeId:status:contractArtifactKind:captureOwnerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    status: parts[1],
    contractArtifactKind: parts[2],
    captureOwnerRepo: parts[3],
  };
}

function parseIndependentNestedPluginExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts.some(part => !part)) {
    console.error(`Expected independent nested plugin in <providerId:surfaceId:parentPluginId:nestedPluginId:nestedOwnerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    parentPluginId: parts[2],
    nestedPluginId: parts[3],
    nestedOwnerRepo: parts[4],
  };
}

function parseLocalProviderCatalogExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some(part => !part)) {
    console.error(`Expected local provider catalog in <runtimeId:status:path-substring> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    status: parts[1],
    pathSubstring: parts[2],
  };
}

function parseLocalProviderCatalogProviderExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 2 || parts.some(part => !part)) {
    console.error(`Expected local provider catalog provider in <runtimeId:providerId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    providerId: parts[1],
  };
}

function parseLocalProviderCatalogAdvertisementExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 2 || parts.some(part => !part)) {
    console.error(`Expected local provider catalog advertisement in <runtimeId:advertisement-path-substring> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    pathSubstring: parts[1],
  };
}

function parseRuntimeCaptureArtifactExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts.some(part => !part)) {
    console.error(`Expected runtime capture artifact in <runtimeId:kind:schema:providerId:surfaceId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    kind: parts[1],
    schema: parts[2],
    providerId: parts[3],
    surfaceId: parts[4],
  };
}

function parseWorldLoweringGapExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts.some(part => !part)) {
    console.error(`Expected world lowering gap in <providerId:surfaceId:targetId:ownerRepo:runtimeId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    targetId: parts[2],
    ownerRepo: parts[3],
    runtimeId: parts[4],
  };
}

function parseWorldLoweringCoverageExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 6 || parts.some(part => !part)) {
    console.error(`Expected world lowering coverage in <providerId:surfaceId:targetId:status:ownerRepo:runtimeId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    targetId: parts[2],
    status: parts[3],
    ownerRepo: parts[4],
    runtimeId: parts[5],
  };
}

function parseCommandBoundaryCoverageExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 6 || parts.some(part => !part)) {
    console.error(`Expected command boundary coverage in <providerId:surfaceId:targetId:status:ownerRepo:runtimeId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    targetId: parts[2],
    status: parts[3],
    ownerRepo: parts[4],
    runtimeId: parts[5],
  };
}

function parseRuntimePluginGapExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some(part => !part)) {
    console.error(`Expected runtime plugin projection gap in <runtimeId:pluginId:ownerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    pluginId: parts[1],
    ownerRepo: parts[2],
  };
}

function parseRuntimePluginProjectionCoverageExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some(part => !part)) {
    console.error(`Expected runtime plugin projection coverage in <runtimeId:pluginId:status:ownerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    pluginId: parts[1],
    status: parts[2],
    ownerRepo: parts[3],
  };
}

function parseProviderRuntimePluginProjectionCoverageExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 6 || parts.some(part => !part)) {
    console.error(`Expected provider runtime plugin projection coverage in <providerId:surfaceId:runtimeId:pluginId:status:runtimeOwnerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    runtimeId: parts[2],
    pluginId: parts[3],
    status: parts[4],
    runtimeOwnerRepo: parts[5],
  };
}

function parseSplitTargetBlockerRecordExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts.slice(2).join(":")) {
    console.error(`Expected split target blocker record in <targetId:kind:subject> form, got: ${value}`);
    process.exit(2);
  }
  return {
    targetId: parts[0],
    kind: parts[1],
    subject: parts.slice(2).join(":"),
  };
}

function parseSplitHandoffMoveExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 6 || parts.slice(0, 5).some(part => !part) || !parts.slice(5).join(":")) {
    console.error(`Expected split handoff move in <splitTarget:runtimeId:moveSetId:pathKind:status:path-substring> form, got: ${value}`);
    process.exit(2);
  }
  return {
    splitTarget: parts[0],
    runtimeId: parts[1],
    moveSetId: parts[2],
    pathKind: parts[3],
    status: parts[4],
    pathSubstring: parts.slice(5).join(":"),
  };
}

function parsePluginHandoffMoveExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 5 || parts.slice(0, 4).some(part => !part) || !parts.slice(4).join(":")) {
    console.error(`Expected plugin handoff move in <pluginId:moveSetId:pathKind:status:path-substring> form, got: ${value}`);
    process.exit(2);
  }
  return {
    pluginId: parts[0],
    moveSetId: parts[1],
    pathKind: parts[2],
    status: parts[3],
    pathSubstring: parts.slice(4).join(":"),
  };
}

function parseProviderHandoffMoveExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 5 || parts.slice(0, 4).some(part => !part) || !parts.slice(4).join(":")) {
    console.error(`Expected provider handoff move in <providerId:moveSetId:pathKind:status:path-substring> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    moveSetId: parts[1],
    pathKind: parts[2],
    status: parts[3],
    pathSubstring: parts.slice(4).join(":"),
  };
}

function parsePluginExpectation(value, field) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    console.error(`Expected plugin ${field} in <pluginId:${field}> form, got: ${value}`);
    process.exit(2);
  }
  return {
    pluginId: value.slice(0, separator),
    [field]: value.slice(separator + 1),
  };
}

function parsePluginRuntimeFieldExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts.slice(2).join(":")) {
    console.error(`Expected plugin runtime field in <pluginId:field.path:value> form, got: ${value}`);
    process.exit(2);
  }
  return {
    pluginId: parts[0],
    fieldPath: parts[1],
    value: parts.slice(2).join(":"),
  };
}

function parsePluginAbiFieldExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts.slice(3).join(":")) {
    console.error(`Expected plugin ABI field in <pluginId:operation:field.path:value> form, got: ${value}`);
    process.exit(2);
  }
  return {
    pluginId: parts[0],
    operation: parts[1],
    fieldPath: parts[2],
    value: parts.slice(3).join(":"),
  };
}

function parsePluginAbiOperationCoverageExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some(part => !part)) {
    console.error(`Expected plugin ABI operation coverage in <pluginId:operation:status:ownerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    pluginId: parts[0],
    operation: parts[1],
    status: parts[2],
    ownerRepo: parts[3],
  };
}

function parseProviderSurfaceFieldExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts.slice(3).join(":")) {
    console.error(`Expected provider surface field in <providerId:surfaceId:field.path:value> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    fieldPath: parts[2],
    value: parts.slice(3).join(":"),
  };
}

function parseInteractiveWorldSurfaceExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 4 || parts.some(part => !part)) {
    console.error(`Expected interactive world surface in <providerId:surfaceId:targetId:ownerRepo> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    targetId: parts[2],
    ownerRepo: parts[3],
  };
}

function parseProviderPluginRequirementExpectation(value) {
  const parts = value.split(":");
  if (![5, 6].includes(parts.length) || parts.some(part => !part)) {
    console.error(`Expected provider plugin requirement in <providerId:surfaceId:pluginId:status:pluginOwnerRepo[:availability]> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    pluginId: parts[2],
    status: parts[3],
    pluginOwnerRepo: parts[4],
    availability: parts[5] || "",
  };
}

function parseProviderExpectation(value, field) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    console.error(`Expected provider ${field} in <providerId:${field}> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: value.slice(0, separator),
    [field]: value.slice(separator + 1),
  };
}

function parsePluginWitnessExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some(part => !part)) {
    console.error(`Expected plugin witness in <pluginId:transport:status> form, got: ${value}`);
    process.exit(2);
  }
  return { pluginId: parts[0], transport: parts[1], status: parts[2] };
}

function parseProviderSurfaceKindExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some(part => !part)) {
    console.error(`Expected provider surface kind in <providerId:surfaceId:surfaceKind> form, got: ${value}`);
    process.exit(2);
  }
  return {
    providerId: parts[0],
    surfaceId: parts[1],
    surfaceKind: parts[2],
  };
}

function parseRuntimeExpectation(value, field) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    console.error(`Expected runtime ${field} in <runtimeId:${field}> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: value.slice(0, separator),
    [field]: value.slice(separator + 1),
  };
}

function parseRuntimeWitnessExpectation(value) {
  const parts = value.split(":");
  if (parts.length !== 5 || parts.some(part => !part)) {
    console.error(`Expected runtime witness in <runtimeId:providerId:surfaceId:cacheState:status> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    providerId: parts[1],
    surfaceId: parts[2],
    cacheState: parts[3],
    status: parts[4],
  };
}

function parseRuntimeWorldTargetExpectation(value) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    console.error(`Expected runtime world target in <runtimeId:targetId> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: value.slice(0, separator),
    targetId: value.slice(separator + 1),
  };
}

function parseRuntimeWorldFieldExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts.slice(3).join(":")) {
    console.error(`Expected runtime world field in <runtimeId:targetId:field.path:value> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    targetId: parts[1],
    fieldPath: parts[2],
    value: parts.slice(3).join(":"),
  };
}

function parseRuntimeLifecycleFieldExpectation(value) {
  const parts = value.split(":");
  if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts.slice(3).join(":")) {
    console.error(`Expected runtime lifecycle field in <runtimeId:stage:field.path:value> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    stage: parts[1],
    fieldPath: parts[2],
    value: parts.slice(3).join(":"),
  };
}

function readNestedField(source, fieldPath) {
  let value = source;
  for (const segment of fieldPath.split(".")) {
    if (!value || typeof value !== "object") return "";
    value = value[segment];
  }
  return typeof value === "string" ? value : "";
}

function parseRuntimeLifecycleExpectation(value, field) {
  const parts = value.split(":");
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts.slice(2).join(":")) {
    console.error(`Expected runtime lifecycle ${field} in <runtimeId:stage:${field}> form, got: ${value}`);
    process.exit(2);
  }
  return {
    runtimeId: parts[0],
    stage: parts[1],
    [field]: parts.slice(2).join(":"),
  };
}

function parseSplitTargetExpectation(value, field) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    console.error(`Expected split target ${field} in <targetId:${field}> form, got: ${value}`);
    process.exit(2);
  }
  return {
    targetId: value.slice(0, separator),
    [field]: value.slice(separator + 1),
  };
}

function mergeRuntimeRecords(topLevelRuntimes, runtimeTargets) {
  const byId = new Map();
  for (const runtime of runtimeTargets) {
    if (runtime.runtimeId) byId.set(runtime.runtimeId, runtime);
  }
  for (const runtime of topLevelRuntimes) {
    if (!runtime.runtimeId) continue;
    byId.set(runtime.runtimeId, {
      ...(byId.get(runtime.runtimeId) || {}),
      ...runtime,
    });
  }
  return [...byId.values()];
}
