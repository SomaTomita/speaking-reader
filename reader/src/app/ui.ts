/**
 * UI utilities — Announcer, ToastHost, DOM helpers.
 */

export function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

export class Announcer {
  constructor(private readonly region: HTMLElement) {}

  announce(message: string): void {
    this.region.textContent = "";
    window.setTimeout(() => {
      this.region.textContent = message;
    }, 30);
  }
}

export class ToastHost {
  constructor(private readonly stack: HTMLElement) {}

  show(message: string, variant: "info" | "error" = "info"): void {
    const el = document.createElement("div");
    el.className = variant === "error" ? "toast toast--error" : "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    this.stack.append(el);
    window.setTimeout(() => {
      el.remove();
    }, 4200);
  }
}
