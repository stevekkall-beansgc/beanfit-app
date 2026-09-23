export function configureDevice() {
  var root = document.getElementById("stack-config");
  var btn = document.getElementById("gen-stack");
  var deviceId = root ? root.getAttribute("data-device-id") : null;
  if (!root || !btn || !deviceId) return;
  function bindCopies() {
    document.querySelectorAll("#stack-result .copy-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(b.getAttribute("data-code"));
        b.textContent = "copied";
      });
    });
  }
  btn.addEventListener("click", function () {
    var surfaces = Array.prototype.slice.call(
      root.querySelectorAll('input[name="surf"]:checked')
    ).map(function (c) { return c.value; });
    if (!surfaces.length) { alert("Pick at least one thing to do"); return; }
    var model = root.querySelector('select[name="model"]').value;
    btn.disabled = true; btn.textContent = "Building…";
    fetch("/api/devices/" + encodeURIComponent(deviceId) + "/stack", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ surfaces: surfaces, model_tag: model })
    }).then(function (r) { return r.text(); }).then(function (frag) {
      document.getElementById("stack-result").innerHTML = frag;
      bindCopies();
      btn.disabled = false; btn.textContent = "Generate my setup";
    }).catch(function () {
      var box = document.getElementById("stack-result");
      if (box) box.innerHTML = '<p class="error">Could not build your setup — check your connection and try again.</p>';
      btn.disabled = false; btn.textContent = "Generate my setup";
    });
  });
  bindCopies();
}
