/* Renders the published script and signal library from the same manifest the
   application reads, so the page cannot drift from what is actually hosted. */
(function () {
  "use strict";

  var mount = document.getElementById("library");
  if (!mount) return;

  function card(entry, kind) {
    var item = document.createElement("li");
    item.className = "library__item";

    var name = document.createElement("h3");
    name.textContent = entry.name || entry.url;
    item.appendChild(name);

    if (entry.description) {
      var description = document.createElement("p");
      description.textContent = entry.description;
      item.appendChild(description);
    }

    var url = document.createElement("p");
    url.className = "library__url";
    url.textContent = entry.url;
    item.appendChild(url);

    var actions = document.createElement("div");
    actions.className = "library__actions";

    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn--ghost";
    copy.textContent = "Copy URL";
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Copied";
        window.setTimeout(function () {
          copy.textContent = "Copy URL";
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(entry.url).then(done, function () {
          copy.textContent = "Copy failed";
        });
      } else {
        copy.textContent = "Copy failed";
      }
    });
    actions.appendChild(copy);

    var open = document.createElement("a");
    open.className = "btn btn--ghost";
    open.href = entry.url;
    open.textContent = kind === "signal" ? "Listen" : "View";
    actions.appendChild(open);

    item.appendChild(actions);
    return item;
  }

  function render(manifest) {
    var scripts = manifest.scripts || [];
    var signals = manifest.signals || [];
    mount.innerHTML = "";

    if (!scripts.length && !signals.length) {
      var empty = document.createElement("p");
      empty.className = "library__empty";
      empty.textContent = "Nothing is published here yet.";
      mount.appendChild(empty);
      return;
    }

    var list = document.createElement("ul");
    list.className = "library";
    scripts.forEach(function (entry) {
      list.appendChild(card(entry, "script"));
    });
    signals.forEach(function (entry) {
      list.appendChild(card(entry, "signal"));
    });
    mount.appendChild(list);
  }

  fetch("/content/manifest.json", { headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok)
        throw new Error("manifest unavailable: " + response.status);
      return response.json();
    })
    .then(render)
    .catch(function () {
      mount.innerHTML =
        '<p class="library__empty">The published library could not be loaded. It is served from ' +
        "<code>/content/manifest.json</code> on this site.</p>";
    });
})();
