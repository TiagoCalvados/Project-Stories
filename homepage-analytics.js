(() => {
  if (window.location.hostname !== "project-stories-eta.vercel.app") return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;
  if (!["/", "/index.html"].includes(window.location.pathname)) return;

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  window.va("beforeSend", (event) => {
    const pageUrl = new URL(event.url);
    if (event.type !== "pageview" || !["/", "/index.html"].includes(pageUrl.pathname)) {
      return null;
    }
    pageUrl.pathname = "/";
    pageUrl.search = "";
    pageUrl.hash = "";
    return { ...event, url: pageUrl.toString() };
  });

  const analyticsScript = document.createElement("script");
  analyticsScript.defer = true;
  analyticsScript.src = "/_vercel/insights/script.js";
  document.head.appendChild(analyticsScript);
})();
