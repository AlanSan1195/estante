/** Reglas de arquitectura: el núcleo hexagonal no conoce la infraestructura. */
module.exports = {
  forbidden: [
    {
      name: 'core-sin-infraestructura',
      comment: 'src/core solo puede depender de sí mismo (dominio, puertos, casos de uso).',
      severity: 'error',
      from: { path: '^src/core' },
      to: {
        pathNot: '^src/core',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-sin-node',
      severity: 'error',
      from: { path: '^src/core' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'motor-sin-react',
      comment: 'El motor de lectura es TS puro: no importa React, UI ni adaptadores.',
      severity: 'error',
      from: { path: '^src/reader-engine' },
      to: { path: '^(src/(ui|adapters|integration)|node_modules/(react|react-dom))' },
    },
    {
      name: 'dominio-sin-adaptadores',
      severity: 'error',
      from: { pathNot: '^src/(integration|ui|pages|adapters)|^scripts' },
      to: { path: '^src/adapters' },
    },
    { name: 'sin-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '\\.astro$' },
  },
};
