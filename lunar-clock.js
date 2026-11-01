// Moon artwork and colour/rotation rhythm adapted from the user's Desktop
// Lunar Keys Clock.html. The original project is not modified or embedded.
export function lunarClockState(date, reducedMotion = false) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = date.getHours() % 12 + minutes / 60;
  const midi = 36 + (date.getSeconds() * 7) % 60;
  return {
    hours: hours * 30, minutes: minutes * 6, seconds: seconds * 6,
    moonRotation: reducedMotion ? 0 : (date.getTime() % 180000) / 500,
    hue: (midi % 12) * 30 + Math.floor(midi / 12) * 7,
    brightness: reducedMotion ? 1.05 : 1 + 0.13 * Math.exp(-date.getMilliseconds() / 250),
  };
}

const clock = typeof document === "undefined" ? null : document.getElementById("lunar-clock");
if (clock) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hour = clock.querySelector("[data-clock-hour]");
  const minute = clock.querySelector("[data-clock-minute]");
  const second = clock.querySelector("[data-clock-second]");
  const moon = clock.querySelector("[data-clock-moon]");
  const moonTouch = document.getElementById("lunar-moon-touch");
  let fading = null;
  function fadeMoon() {
    if (fading || !clock.animate) return;
    // Hide the entire clock, including its rim and hands. Time keeps running.
    // 100 ms out, one full second invisible, then 100 ms back.
    fading = clock.animate([
      { opacity: 1 }, { opacity: 0, offset: 1 / 12 },
      { opacity: 0, offset: 11 / 12 }, { opacity: 1 },
    ], { duration: 1200, easing: "linear" });
    fading.finished.catch(() => {}).finally(() => { fading = null; });
  }
  moonTouch?.addEventListener("click", fadeMoon);
  moonTouch?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) fadeMoon();
  });
  let previous = -Infinity;
  function update(timestamp) {
    if (!document.hidden && timestamp - previous >= (reduced.matches ? 1000 : 40)) {
      previous = timestamp;
      const state = lunarClockState(new Date(), reduced.matches);
      hour.setAttribute("transform", `rotate(${state.hours})`);
      minute.setAttribute("transform", `rotate(${state.minutes})`);
      second.setAttribute("transform", `rotate(${state.seconds})`);
      moon.setAttribute("transform", `rotate(${state.moonRotation} 151.5 168)`);
      moon.style.filter = `hue-rotate(${state.hue}deg) saturate(1.25) brightness(${state.brightness})`;
    }
    window.requestAnimationFrame(update);
  }
  update(0);
}
