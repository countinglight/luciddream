import { requireHttpsUrl } from "../url";

describe("requireHttpsUrl", () => {
  it("accepts an https address and normalises it", () => {
    expect(requireHttpsUrl(" https://example.test/a.yaml ")).toBe(
      "https://example.test/a.yaml",
    );
  });

  it("refuses plain http, which can be replaced in transit", () => {
    expect(() => requireHttpsUrl("http://example.test/a.yaml")).toThrow(
      /https:\/\//,
    );
  });

  it("refuses other schemes", () => {
    expect(() => requireHttpsUrl("file:///etc/passwd")).toThrow(/https:\/\//);
    expect(() => requireHttpsUrl("ftp://example.test/a")).toThrow(/https:\/\//);
  });

  it("refuses something that is not an address at all", () => {
    expect(() => requireHttpsUrl("not a url")).toThrow(/not a web address/);
  });

  it("resolves a relative path against an https base", () => {
    expect(
      requireHttpsUrl("scripts/a.yaml", "https://example.test/content/"),
    ).toBe("https://example.test/content/scripts/a.yaml");
  });

  it("refuses a relative path against an http base", () => {
    expect(() =>
      requireHttpsUrl("scripts/a.yaml", "http://example.test/content/"),
    ).toThrow(/https:\/\//);
  });
});
