// jest-expo setupFiles require('expo/src/winter'), which RN resolution maps to
// runtime.native.ts. That file installs WinterCG globals as lazy getters.
// Jest 30 forbids those getters' later require() from test files
// ("import a file outside of the scope of the test code"). Evaluate them here,
// while setupFiles is still in scope, without mocking the rest of expo.
[
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoderStream',
  'URL',
  'URLSearchParams',
  '__ExpoImportMetaRegistry',
  'structuredClone',
].forEach((name) => {
  void globalThis[name];
});
