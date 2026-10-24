// Vitest setup. Add jest-dom style matchers or global stubs here if tests need them.

// jsdom has no canvas and logs "Not implemented" from getContext. A null context makes canvas code skip drawing.
// Some test files run in the node environment, where there is no DOM to stub.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
}
