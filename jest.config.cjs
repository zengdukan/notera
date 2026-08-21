module.exports = {
  moduleDirectories: ['node_modules', 'release/app/node_modules', 'src'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/.erb/mocks/fileMock.js',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
  },
  roots: ['<rootDir>/packages', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['release/app/dist', '.erb/dll'],
  transform: {
    '\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
};
