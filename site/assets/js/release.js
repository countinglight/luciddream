/* Reads the current Android build from the public GitHub release, so no page
   edit is needed when a release is cut. The hard-coded fallback below is what
   the page already shows before (or instead of) a successful request. */
(function () {
  "use strict";

  var REPO = "countinglight/luciddream";
  var TESTFLIGHT_URL = "https://testflight.apple.com/join/PLACEHOLDER";
  var FALLBACK = {
    tag: "0.5.0",
    url: "https://github.com/countinglight/luciddream/releases/download/0.5.0/luciddream-v1.0.0-release.apk",
    size: 62715050,
    published: "2026-09-07T18:05:56Z",
  };

  function megabytes(bytes) {
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function day(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function apply(info) {
    document
      .querySelectorAll("[data-testflight=download]")
      .forEach(function (el) {
        el.href = TESTFLIGHT_URL;
      });
    document.querySelectorAll("[data-release=version]").forEach(function (el) {
      el.textContent = "v" + info.tag;
    });
    document.querySelectorAll("[data-release=size]").forEach(function (el) {
      el.textContent = megabytes(info.size);
    });
    document.querySelectorAll("[data-release=date]").forEach(function (el) {
      el.textContent = day(info.published);
    });
    document.querySelectorAll("[data-release=download]").forEach(function (el) {
      el.href = info.url;
    });
  }

  apply(FALLBACK);

  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(function (response) {
      if (!response.ok)
        throw new Error("release lookup failed: " + response.status);
      return response.json();
    })
    .then(function (data) {
      var apk = (data.assets || []).filter(function (asset) {
        return /\.apk$/i.test(asset.name);
      })[0];
      if (!apk) return;
      apply({
        tag: String(data.tag_name || FALLBACK.tag).replace(/^v/, ""),
        url: apk.browser_download_url,
        size: apk.size,
        published: data.published_at,
      });
    })
    .catch(function () {
      /* Offline, rate-limited, or blocked: the fallback above already applies. */
    });
})();
