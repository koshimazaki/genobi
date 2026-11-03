/**
 * The routes on which a tester token stands in for the operator's Comfy key:
 * staging deployment inputs, quoting, submitting and polling. Everywhere else
 * (balance, uploads, chains, Cloud checks) the request is treated as keyless,
 * so the operator's key can never reach another provider route.
 */
export function testerScoped(method: string, path: string) {
  if (method === "POST")
    return (
      path === "/api/quotes" ||
      path === "/api/jobs" ||
      /^\/api\/settings\/deployment-assets\/[^/]+$/.test(path)
    );
  return method === "GET" && /^\/api\/jobs\/[^/]+$/.test(path);
}
