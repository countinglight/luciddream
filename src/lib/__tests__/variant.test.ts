import { isPrototypeHost } from "../variant";

describe("isPrototypeHost", () => {
  it("recognises the prototype custom domain and workers.dev address", () => {
    expect(isPrototypeHost("luciddream-prototype.countinglight.com", "")).toBe(
      true,
    );
    expect(
      isPrototypeHost("luciddream-prototype.example.workers.dev", ""),
    ).toBe(true);
  });

  it("never matches production", () => {
    expect(isPrototypeHost("luciddreamapp.countinglight.com", "")).toBe(false);
    expect(isPrototypeHost("luciddream-web.example.workers.dev", "")).toBe(
      false,
    );
  });

  it("can be previewed locally with ?variant=prototype", () => {
    expect(isPrototypeHost("localhost", "?variant=prototype")).toBe(true);
    expect(isPrototypeHost("localhost", "?variant=other")).toBe(false);
  });
});
