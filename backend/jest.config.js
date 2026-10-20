/**
 * Configuracion de Jest para el backend de SumaControl.
 *
 * preset ts-jest: los archivos .ts se compilan en memoria con el mismo
 * tsconfig del proyecto, asi que las pruebas ven exactamente los tipos que
 * ve el codigo de produccion y no hay un paso de build previo.
 *
 * Solo se mide cobertura sobre src/services y src/models, que es donde vive
 * la logica de negocio pura. Los controladores y las rutas quedan fuera a
 * proposito: se validan en las pruebas integrales, no en las unitarias.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // tsconfig.test.json agrega los tipos de Jest sin tocar el tsconfig del
  // proyecto, que compila a dist/ y no debe conocer el runner de pruebas.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/models/**/*.ts',
    '!src/**/*.d.ts'
  ],
  verbose: true
};
