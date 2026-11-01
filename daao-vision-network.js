// The worker may download the fixed runtime/model before it sees an image.
// Once loaded, every fetch is rejected until the worker is destroyed.
export function installDownloadOnlyNetwork(scope) {
  const download = scope.fetch.bind(scope);
  let locked = false;
  scope.fetch = (input, options) => {
    if (locked) return Promise.reject(new Error("network-disabled-during-vision"));
    const method = options?.method || input?.method || "GET";
    if (!["GET", "HEAD"].includes(method.toUpperCase()) || options?.body || input?.body) return Promise.reject(new Error("uploads-disabled"));
    return download(input, options);
  };
  scope.WebSocket = scope.XMLHttpRequest = scope.EventSource = undefined;
  return () => { locked = true; };
}
