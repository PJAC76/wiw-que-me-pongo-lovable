"""E2E: los campos rellenados por IA mantienen su resaltado hasta que
se editan, y al guardar la prenda los valores (editados o no) se
persisten correctamente en la base de datos.

Flujo:
  1. Login → /wardrobe/add → subir imagen → "Detectar con IA".
  2. Verifica que color, category y occasions tienen data-ai='true' y
     que el resaltado NO desaparece por sí solo (persiste tras un rato
     y tras interacciones que no editan el campo, como enfocar y
     desenfocar el input sin cambiar el valor).
  3. Edita SOLO el color → su data-ai desaparece; category y occasions
     mantienen su resaltado.
  4. Guarda la prenda → confirma en BD que:
        - color = valor editado
        - category = "tops" (IA, sin editar)
        - occasions contiene "casual" (IA, sin editar)
        - name = valor introducido

Depende del modo mock de detección (sin LOVABLE_API_KEY el server fn
devuelve category=tops, primary_color=<primer color permitido>,
occasions=["casual"]).
"""
import asyncio
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["VITE_SUPABASE_URL"]
APIKEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"]
EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-ai-highlight-persist"
SCREENS.mkdir(parents=True, exist_ok=True)

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-ai-hl-persist.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

STAMP = int(time.time())
ITEM_NAME = f"E2E HL PERSIST {STAMP}"
EDITED_COLOR = "verde oliva"


def rest(method, path, token, body=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        method=method,
        headers={
            "apikey": APIKEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


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


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 900})
        page = await ctx.new_page()
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        await login(page)
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)

        # Detectar con IA
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

        # Los tres campos IA esperados deben estar resaltados
        assert await page.locator("input#color[data-ai='true']").count() == 1, (
            "color debería tener data-ai tras detección"
        )
        assert await page.locator("[data-ai='true']").count() >= 3, (
            "se esperaban al menos 3 campos con data-ai (color, category, occasions)"
        )
        ai_initial = await page.locator("[data-ai='true']").count()

        # El color IA debe conservarse: focus + blur sin editar no lo quita
        color_input = page.locator("input#color")
        detected_color = await color_input.input_value()
        assert detected_color, "IA no rellenó el color"
        await color_input.focus()
        await page.locator("body").click(position={"x": 5, "y": 5})
        await page.wait_for_timeout(300)
        assert await page.locator("input#color[data-ai='true']").count() == 1, (
            "focus/blur sin editar no debe quitar el resaltado IA del color"
        )

        # Pasado un tiempo, el resaltado sigue ahí (no es una animación efímera)
        await page.wait_for_timeout(1200)
        ai_after_wait = await page.locator("[data-ai='true']").count()
        assert ai_after_wait == ai_initial, (
            f"el resaltado IA no debe desaparecer solo (antes={ai_initial}, después={ai_after_wait})"
        )

        # Editar SOLO el color → pierde su data-ai; los otros lo conservan
        await color_input.fill(EDITED_COLOR)
        await expect(page.locator("input#color[data-ai='true']")).to_have_count(0, timeout=2000)
        assert await page.locator("[data-ai='true']").count() == ai_initial - 1, (
            "editar color debe quitar exactamente 1 data-ai"
        )
        # category y occasions siguen resaltados
        assert await page.locator("button[data-ai='true']").count() >= 1, (
            "category (SelectTrigger) debería conservar data-ai"
        )
        assert await page.locator("div[data-ai='true']").count() >= 1, (
            "occasions (wrapper) debería conservar data-ai"
        )

        await page.screenshot(path=str(SCREENS / "2_after_edit_color.png"))

        # Guardar
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.get_by_role("button", name=re.compile("Guardar prenda")).click()
        await page.wait_for_url("**/wardrobe", timeout=20000)
        await page.wait_for_load_state("networkidle")

        # Verificar en BD
        access_token = await page.evaluate(
            "() => { const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')); "
            "return k ? JSON.parse(localStorage.getItem(k)).access_token : null; }"
        )
        rows = rest(
            "GET",
            f"/rest/v1/clothing_items?name=eq.{urllib.parse.quote(ITEM_NAME)}"
            "&select=id,name,category,color,occasions&limit=1",
            access_token,
        )
        assert rows, f"item {ITEM_NAME!r} no encontrado en BD"
        item = rows[0]
        print("fila en BD:", item)

        assert item["name"] == ITEM_NAME, f"name: {item['name']!r}"
        assert item["color"] == EDITED_COLOR, (
            f"color editado no persistido: esperado {EDITED_COLOR!r}, got {item['color']!r}"
        )
        assert item["category"] == "tops", (
            f"category IA (sin editar) no conservada: {item['category']!r}"
        )
        assert "casual" in (item["occasions"] or []), (
            f"occasions IA (sin editar) no conservadas: {item['occasions']!r}"
        )

        # Limpieza
        rest("DELETE", f"/rest/v1/clothing_items?id=eq.{item['id']}", access_token)
        print(f"item {item['id']} eliminado")

        await browser.close()

    print("OK: resaltado IA se mantiene hasta editar y los valores se persisten en BD.")


asyncio.run(main())
