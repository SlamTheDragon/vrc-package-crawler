import { createServer } from "node:net";

/** Ask the OS for a free local port; release it immediately before spawning a server. */
export async function unusedLoopbackPort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => typeof address === "object" && address ? resolvePort(address.port) : reject(new Error("No loopback port")));
    });
  });
}
