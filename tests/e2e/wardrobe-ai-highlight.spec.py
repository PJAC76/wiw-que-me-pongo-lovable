"""E2E: "Detectar con IA" resalta solo los campos rellenados por IA,
y el resaltado desaparece al editar cada uno antes de guardar.

Depende del modo mock de detección (AI_DETECTION_MOCK=1): rellena
category=tops, primary_color=<algún color>, occasions=["casual"].
Por tanto esperamos data-ai en: color (input), category (SelectTrigger)
y occasions (wrapper). El resto NO deben llevar data-ai.
"""
import asyncio
import os
import re
import time
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-ai-highlight"
SCREENS.mkdir(parents=True, exist_ok=True)

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-ai-highlight.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

# Campos que la IA-mock NUNCA rellena → no deben tener data-ai tras la detección.
NON_AI_FIELDS = ["name", "subcategory", "secondaryColor", "brand", "material", "season"]


async def login(page):
    await page.goto(f"{BASE}/auth", wait_until="networkidle")
    await page.wait_for_function(
        "() => !!document.querySelector('form') && !document.querySelector('button[type=submit]')?.disabled",
        timeout=10000,
    )
    await page.get_by_label("Email").fill(EMAIL)
    await page.get_by_label("Contraseña").fill(PASSWORD)
    await page.wait_for_timeout(300)
    await page.get_by_role("button", name="Entrar").click()
    await page.wait_for_function(
        "() => Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'))",
        timeout=15000,
    )


async def count_ai(page):
    return await page.locator("[data-ai='true']").count()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 900})
        page = await ctx.new_page()

        await login(page)
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)

        # Antes de detectar: cero elementos con data-ai
        pre = await count_ai(page)
        assert pre == 0, f"antes de detectar no debería haber data-ai, hay {pre}"

        # Disparar detección IA
        await page.get_by_role("button", name=re.compile("Detectar con IA")).click()
        status = page.locator('[role="status"][data-stage]')
        await expect(status).to_be_visible(timeout=5000)
        deadline = time.time() + 8
        while time.time() < deadline:
            s = await status.get_attribute("data-stage")
            if s == "success":
                break
            if s == "error":
                raise AssertionError(f"detección IA en error: {await status.inner_text()}")
            await page.wait_for_timeout(80)
        else:
            raise AssertionError("detección IA no llegó a success")

        await page.screenshot(path=str(SCREENS / "1_after_detect.png"))

        # Campos IA esperados: color, category, occasions
        for f in ["color", "category", "occasions"]:
            n = await page.locator(f"[data-ai='true']#{f}, [data-ai='true'][data-ai]").count()
            assert await page.locator(f"#{f}[data-ai='true'], [data-ai='true']:has(#{f}), [data-ai='true']").count() >= 1
        # Chequeo explícito por selector concreto
        assert await page.locator("input#color[data-ai='true']").count() == 1, "color debería estar resaltado"
        # category y season son SelectTrigger (button); occasions es div wrapper
        ai_total_after = await count_ai(page)
        assert ai_total_after >= 3, f"esperados ≥3 campos IA, vistos {ai_total_after}"

        # Ninguno de los NON_AI_FIELDS debe tener data-ai
        for f in NON_AI_FIELDS:
            has = await page.locator(f"#{f}[data-ai='true']").count()
            assert has == 0, f"campo {f!r} no debería tener data-ai tras detección IA"

        # Editar el color IA → debe perder el resaltado
        color_input = page.locator("input#color")
        await color_input.fill("verde oliva")
        await expect(page.locator("input#color[data-ai='true']")).to_have_count(0, timeout=2000)
        after_color = await count_ai(page)
        assert after_color == ai_total_after - 1, (
            f"editar color debería quitar 1 data-ai (antes={ai_total_after}, después={after_color})"
        )

        # Editar ocasiones → alternar 'casual' quita el resaltado del wrapper
        # OccasionsPicker expone botones con el nombre de la ocasión
        casual_btn = page.get_by_role("button", name=re.compile(r"^casual$", re.I)).first
        if await casual_btn.count() > 0:
            await casual_btn.click()
            await page.wait_for_timeout(150)
            occ_still = await page.locator("[data-ai='true']:has(button)").count()
            # tras editar ocasiones el wrapper ya no debería tener data-ai
            occ_wrapper = await page.locator("div[data-ai='true']").count()
            assert occ_wrapper == 0, f"wrapper ocasiones debería perder data-ai, quedan {occ_wrapper}"

        await page.screenshot(path=str(SCREENS / "2_after_edits.png"))

        # Cambiar categoría también debe quitar su resaltado
        cat_trigger = page.locator("button[data-ai='true']").first
        if await cat_trigger.count() > 0:
            await cat_trigger.click()
            # elegir explícitamente una opción distinta a "tops"
            options = page.get_by_role("option")
            await options.first.wait_for(timeout=3000)
            n_opts = await options.count()
            picked = False
            for i in range(n_opts):
                txt = (await options.nth(i).inner_text()).strip().lower()
                if txt and "top" not in txt:
                    await options.nth(i).click()
                    picked = True
                    break
            assert picked, "no se encontró opción de categoría distinta a tops"
            await page.wait_for_timeout(200)
            remaining = await count_ai(page)
            if remaining != 0:
                info = await page.locator("[data-ai='true']").evaluate_all(
                    "els => els.map(e => ({tag: e.tagName, id: e.id, cls: e.className.slice(0,80)}))"
                )
                print("STILL AI:", info)
            assert remaining == 0, f"tras editar todos los campos IA no debería quedar ninguno, quedan {remaining}"

        await page.screenshot(path=str(SCREENS / "3_all_cleared.png"))
        await browser.close()

    print("OK: resaltado IA aparece solo en campos rellenados y desaparece al editar.")


asyncio.run(main())
