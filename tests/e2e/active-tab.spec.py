"""
Playwright E2E: verifica el resaltado de la pestaña activa en la barra de
navegación inferior.

Estrategia de sesión (en este orden):
  1. Reintentar varias veces la lectura de LOVABLE_BROWSER_SUPABASE_* por si
     el harness aún no ha propagado la sesión tras el login.
  2. Si tras los reintentos siguen vacías, hacer login por UI usando
     credenciales del entorno: TEST_EMAIL / TEST_PASSWORD.
  3. Si tampoco hay credenciales, abortar con instrucciones claras.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

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


def read_session_env() -> tuple[str | None, str | None]:
    sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY") or None
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON") or None
    return sk, sj


async def wait_for_session_env(attempts: int = 8, delay: float = 1.5):
    """Reintenta leer las variables del harness por si tardan en propagarse."""
    for i in range(1, attempts + 1):
        sk, sj = read_session_env()
        if sk and sj:
            print(f"  ✓ sesión del harness disponible (intento {i})")
            return sk, sj
        print(f"  · intento {i}/{attempts}: vars vacías, esperando {delay}s…")
        await asyncio.sleep(delay)
    return None, None


async def ui_login(page) -> bool:
    """Fallback: login por UI con TEST_EMAIL / TEST_PASSWORD."""
    email = os.environ.get("TEST_EMAIL")
    pwd = os.environ.get("TEST_PASSWORD")
    if not (email and pwd):
        return False
    print(f"  · login UI con TEST_EMAIL={email[:3]}***")
    await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
    await page.fill('input#email', email)
    await page.fill('input#password', pwd)
    await page.get_by_role("button", name="Entrar").click()
    try:
        await page.wait_for_url(lambda u: "/auth" not in u, timeout=10000)
        print("  ✓ login UI completado")
        return True
    except Exception as e:
        print(f"  ✗ login UI falló: {e}")
        await page.screenshot(path=str(SCREENSHOTS / "login_failed.png"))
        return False


async def active_label(page) -> str | None:
    return await page.evaluate(
        """() => {
            const nav = document.querySelector('nav[aria-label="Navegación principal"]');
            if (!nav) return null;
            const a = nav.querySelector('a.text-foreground span');
            return a ? a.textContent.trim() : null;
        }"""
    )


async def assert_active(page, expected: str, step: str):
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
    print("Resolviendo sesión…")
    sk, sj = await wait_for_session_env()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="domcontentloaded")

        if sk and sj:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
            )
        else:
            print("  ! vars del harness vacías; probando login UI…")
            ok = await ui_login(page)
            if not ok:
                print(
                    "\nERROR: no hay sesión disponible.\n"
                    "Opciones para desbloquear:\n"
                    "  • Vuelve a iniciar sesión en el preview y espera ~5s\n"
                    "    (el harness reintenta automáticamente al ejecutar el test).\n"
                    "  • O exporta credenciales de prueba en el sandbox:\n"
                    "      TEST_EMAIL=tu@correo.com\n"
                    "      TEST_PASSWORD=********\n"
                )
                await browser.close()
                sys.exit(2)

        # Verificación rápida de sesión.
        await page.goto(f"{BASE}/wardrobe", wait_until="domcontentloaded")
        if "/auth" in page.url:
            print("ERROR: la sesión no es válida; redirige a /auth.")
            await page.screenshot(path=str(SCREENSHOTS / "no_session.png"))
            await browser.close()
            sys.exit(3)

        print("\nCaso 1 — navegación directa a rutas protegidas")
        for path, label in TABS:
            await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            await assert_active(page, label, f"1_direct_{label}")

        print("\nCaso 2 — subrutas mantienen pestaña padre activa")
        await page.goto(f"{BASE}/wardrobe", wait_until="domcontentloaded")
        await assert_active(page, "Armario", "2_parent_wardrobe")
        await page.evaluate("history.pushState({}, '', '/wardrobe/abc-123')")
        await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        await assert_active(page, "Armario", "2_subroute_wardrobe_abc")
        await page.evaluate("history.pushState({}, '', '/outfits/xyz/edit')")
        await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        await assert_active(page, "Outfits", "2_subroute_outfits_edit")

        print("\nCaso 3 — back / forward del navegador")
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
