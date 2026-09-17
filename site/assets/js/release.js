/* Reads the current Android build from the public GitHub release, so no page
   edit is needed when a release is cut. Nothing about a release is written
   into the pages: every element marked data-release-meta starts hidden and
   is shown only once the request succeeds. Offline, rate-limited or blocked,
   the pages simply omit version, size and date, and every download link keeps
   its static href to the latest release page. */
(function () {
  "use strict";

  var REPO = "countinglight/luciddream";
  var TESTFLIGHT_URL = "https://testflight.apple.com/join/PLACEHOLDER";

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

  function each(selector, fn) {
    document.querySelectorAll(selector).forEach(fn);
  }

  each("[data-testflight=download]", function (el) {
    el.href = TESTFLIGHT_URL;
  });

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
      if (!apk || !data.tag_name) return;

      var version = "v" + String(data.tag_name).replace(/^v/, "");
      each("[data-release=version]", function (el) {
        el.textContent = version;
      });
      each("[data-release=size]", function (el) {
        el.textContent = megabytes(apk.size);
      });
      each("[data-release=date]", function (el) {
        el.textContent = day(data.published_at);
      });
      each("[data-release=download]", function (el) {
        el.href = apk.browser_download_url;
      });
      each("[data-release-meta]", function (el) {
        el.hidden = false;
      });
    })
    .catch(function () {
      /* Offline, rate-limited, or blocked: release details stay hidden. */
    });
})();
