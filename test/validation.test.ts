import { assertEquals, assertThrows } from "@std/assert";
import {
  listenerUrl,
  redirectTarget,
  validateCors,
} from "../src/validation.ts";

Deno.test("loopback redirect parsing supports IPv4, IPv6, queries, and HTTP default port", () => {
  const ipv4 = redirectTarget(
    "https://auth.example/?redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback%3Fx%3D1",
  );
  assertEquals(ipv4.hostname, "127.0.0.1");
  assertEquals(ipv4.port, 80);
  assertEquals(ipv4.callbackPath, "/callback");
  const ipv6 = redirectTarget(
    "https://auth.example/?redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A4567%2Fcallback",
  );
  assertEquals(ipv6.hostname, "::1");
  assertEquals(listenerUrl("::1", 4567).origin, "http://[::1]:4567");
  assertEquals(listenerUrl("localhost", 80).host, "localhost");
});

Deno.test("CORS requires one exact HTTP(S) origin", () => {
  assertEquals(
    validateCors("https://broker.example"),
    "https://broker.example",
  );
  for (
    const value of [
      "*",
      "https://broker.example/path",
      "https://broker.example?x=1",
      "ftp://broker.example",
    ]
  ) assertThrows(() => validateCors(value));
});
