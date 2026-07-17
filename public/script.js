document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The cockpit is mounted only when it enters the viewport. This keeps the
// conversation at its first question until the visitor reaches the section,
// avoids running a hidden desktop/mobile player, and leaves a still fallback
// in place if motion is reduced or the player CDN is unavailable.
const cockpitShell = document.querySelector("[data-cockpit-motion]");
const cockpitMount = cockpitShell?.querySelector(".cockpit-motion-mount");
const compactCockpit = window.matchMedia("(max-width: 1024px)");
let cockpitPlayer = null;
let cockpitVariant = null;

function mountCockpit() {
  if (!cockpitShell || !cockpitMount || reduceMotion) return;

  const variant = compactCockpit.matches ? "mobile" : "desktop";
  if (cockpitPlayer && cockpitVariant === variant) return;

  cockpitShell.classList.remove("is-ready");
  cockpitMount.replaceChildren();

  const player = document.createElement("hyperframes-player");
  const mobile = variant === "mobile";
  player.className = "cockpit-motion-player";
  player.setAttribute("src", cockpitShell.dataset[`${variant}Src`]);
  player.setAttribute("width", mobile ? "780" : "1536");
  player.setAttribute("height", mobile ? "1392" : "1020");
  player.setAttribute("autoplay", "");
  player.setAttribute("loop", "");
  player.setAttribute("muted", "");
  player.setAttribute("aria-hidden", "true");
  player.setAttribute("tabindex", "-1");
  player.inert = true;

  cockpitMount.append(player);
  cockpitPlayer = player;
  cockpitVariant = variant;

  window.setTimeout(() => cockpitShell.classList.add("is-ready"), 650);
}

if (cockpitShell && !reduceMotion) {
  if ("IntersectionObserver" in window) {
    const cockpitObserver = new IntersectionObserver(
      (entries, observer) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        mountCockpit();
        observer.unobserve(entry.target);
      },
      { rootMargin: "0px 0px -12%", threshold: 0.18 },
    );
    cockpitObserver.observe(cockpitShell);
  } else {
    mountCockpit();
  }

  compactCockpit.addEventListener?.("change", () => {
    if (cockpitPlayer) mountCockpit();
  });
}

// Reveal sections only when JavaScript is available.
const reveals = document.querySelectorAll(".reveal");
if (reduceMotion || !("IntersectionObserver" in window)) {
  reveals.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.08 },
  );
  reveals.forEach((element) => revealObserver.observe(element));
}

// Interactive value mosaic.
const bentoCards = [...document.querySelectorAll("[data-bento-card]")];
const bento = document.querySelector("[data-bento]");
const defaultBentoCard = bentoCards[0] ?? null;

function activateBento(card) {
  bentoCards.forEach((item) => {
    const active = item === card;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}

bentoCards.forEach((card) => {
  card.addEventListener("mouseenter", () => activateBento(card));
  card.addEventListener("focus", () => activateBento(card));
  card.addEventListener("click", () => activateBento(card));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateBento(card);
  });
});

bento?.addEventListener("mouseleave", () => {
  if (defaultBentoCard) activateBento(defaultBentoCard);
});

bento?.addEventListener("focusout", (event) => {
  if (bento.contains(event.relatedTarget)) return;
  if (defaultBentoCard) activateBento(defaultBentoCard);
});

// Accessible, measured accordions. Several items may remain open.
function setAccordionState(item, open, instant = false) {
  const button = item.querySelector(":scope > button");
  const panel = item.querySelector(":scope > .accordion-panel");
  if (!button || !panel) return;

  item.classList.toggle("is-open", open);
  button.setAttribute("aria-expanded", String(open));

  if (instant) panel.style.transition = "none";
  panel.style.height = open ? `${panel.scrollHeight}px` : "0px";
  if (instant) {
    panel.offsetHeight;
    panel.style.transition = "";
  }
}

document.querySelectorAll("[data-accordion] .accordion-item").forEach((item) => {
  const button = item.querySelector(":scope > button");
  setAccordionState(item, item.classList.contains("is-open"), true);
  button?.addEventListener("click", () => setAccordionState(item, !item.classList.contains("is-open")));
});

window.addEventListener("resize", () => {
  document.querySelectorAll(".accordion-item.is-open").forEach((item) => {
    const panel = item.querySelector(":scope > .accordion-panel");
    if (panel) panel.style.height = `${panel.scrollHeight}px`;
  });
});

// Contact modal with focus restoration and keyboard handling.
const modal = document.querySelector(".contact-modal");
const modalCard = modal?.querySelector(".modal-card");
const openButtons = document.querySelectorAll(".open-contact");
const closeButtons = modal?.querySelectorAll(".close-contact") ?? [];
let previousFocus = null;

function openModal(trigger) {
  if (!modal || !modalCard) return;
  previousFocus = trigger;
  modal.inert = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => modalCard.focus(), 20);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  document.body.classList.remove("modal-open");
  previousFocus?.focus?.();
}

openButtons.forEach((button) => button.addEventListener("click", () => openModal(button)));
closeButtons.forEach((button) => button.addEventListener("click", closeModal));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.classList.contains("is-open")) closeModal();
  if (event.key !== "Tab" || !modal?.classList.contains("is-open")) return;

  const focusable = [...modal.querySelectorAll("button:not([disabled]), a[href]")].filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Keep placeholder product actions honest.
document.querySelectorAll(".chat-input").forEach((button) => {
  button.addEventListener("click", () => openModal(button));
});
