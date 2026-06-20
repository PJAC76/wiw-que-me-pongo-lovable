"""
Playwright E2E: verifica el resaltado de la pestaña activa en la barra de
navegación inferior cuando:
  1. Se navega directamente a una ruta protegida.
  2. Se navega a una subruta (prefijo) de una ruta protegida.
  3. Se usa back / forward del navegador.

Requiere que el dev server esté corriendo en localhost:8080 y que el sandbox
tenga inyectada la sesión de Supabase (LOVABLE_BROWSER_SUPABASE_*).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
SCREENSHOTS = Path(__file__).parent / "screenshots"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

TABS = [
    ("/wardrobe", "Armario"),
    ("/outfits", "Outfits"),
    ("/recommendations", "Para hoy"),
    ("/feed", "Feed"),
    ("/profile", "Perfil"),
]


async def active_label(page) -> str | None:
    """Devuelve la label del <Link> activo en la barra de navegación."""
    return await page.evaluate(
        """() => {
            const nav = document.querySelector('nav[aria-label="Navegación principal"]');
            if (!nav) return null;
            const active = nav.querySelector('a.text-foreground');
            if (!active) return null;
            const span = active.querySelector('span');
            return span ? span.textContent.trim() : null;
        }"""
    )


async def assert_active(page, expected: str, step: str):
    # Esperar a que el Link active se materialice tras la navegación.
    await page.wait_for_function(
        """expected => {
            const nav = document.querySelector('nav[aria-label="Navegación principal"]');
            if (!nav) return false;
            const a = nav.querySelector('a.text-foreground span');
            return a && a.textContent.trim() === expected;
        }""",
        arg=expected,
        timeout=5000,
    )
    label = await active_label(page)
    assert label == expected, f"[{step}] esperaba '{expected}', encontrado '{label}'"
    await page.screenshot(path=str(SCREENSHOTS / f"{step}.png"))
    print(f"  ✓ {step}: pestaña activa = {label}")


async def main():
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not (storage_key and session_json):
        print("ERROR: faltan LOVABLE_BROWSER_SUPABASE_* en el entorno.")
        sys.exit(2)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # 1) Establecer origen y restaurar la sesión.
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        # --- Caso 1: navegación directa a cada ruta protegida ---
        print("Caso 1 — navegación directa a rutas protegidas")
        for path, label in TABS:
            await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            await assert_active(page, label, f"1_direct_{label}")

        # --- Caso 2: subrutas (prefijo) deben mantener la pestaña padre ---
        # Aunque /wardrobe/123 no esté registrada todavía, basta con que la
        # ruta padre /wardrobe siga activa porque activeOptions={exact:false}
        # hace coincidir por prefijo. Probamos vía history.pushState para no
        # depender de la presencia de una ruta hija real.
        print("Caso 2 — subrutas mantienen pestaña padre activa")
        await page.goto(f"{BASE}/wardrobe", wait_until="domcontentloaded")
        await assert_active(page, "Armario", "2_parent_wardrobe")
        # Empujar una subruta sintética; la barra debe seguir resaltando "Armario".
        await page.evaluate("history.pushState({}, '', '/wardrobe/abc-123')")
        await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        await assert_active(page, "Armario", "2_subroute_wardrobe_abc")

        await page.evaluate("history.pushState({}, '', '/outfits/xyz/edit')")
        await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        await assert_active(page, "Outfits", "2_subroute_outfits_edit")

        # --- Caso 3: back / forward del navegador ---
        print("Caso 3 — back / forward del navegador")
        await page.goto(f"{BASE}/wardrobe", wait_until="domcontentloaded")
        await assert_active(page, "Armario", "3_history_a_wardrobe")
        await page.goto(f"{BASE}/feed", wait_until="domcontentloaded")
        await assert_active(page, "Feed", "3_history_b_feed")
        await page.goto(f"{BASE}/profile", wait_until="domcontentloaded")
        await assert_active(page, "Perfil", "3_history_c_profile")

        await page.go_back(wait_until="domcontentloaded")
        await assert_active(page, "Feed", "3_history_back_feed")
        await page.go_back(wait_until="domcontentloaded")
        await assert_active(page, "Armario", "3_history_back_wardrobe")
        await page.go_forward(wait_until="domcontentloaded")
        await assert_active(page, "Feed", "3_history_forward_feed")
        await page.go_forward(wait_until="domcontentloaded")
        await assert_active(page, "Perfil", "3_history_forward_profile")

        await browser.close()
        print("\nTodos los casos pasaron ✅")


if __name__ == "__main__":
    asyncio.run(main())
